import { Resource } from './resourceModel';
import {isObject, unionBy, merge, keys, cloneDeep, entries, isArray, pick, defaults} from 'lodash-bound';
import {LINK_STROKE, PROCESS_TYPE, Node} from './visualResourceModel';
import {Lyph} from "./shapeModel";
import {addColor} from './utils';
import {logger} from './logger';

/**
 *  Group (subgraph) model
 * @class
 * @property nodes
 * @property links
 * @property regions
 * @property lyphs
 * @property materials
 * @property references
 * @property groups
 * @property trees
 * @property channels
 * @property coalescences
 * @property inGroups
 */
export class Group extends Resource {
    /**
     * Create a graph model from the JSON specification
     * @param json - input model
     * @param modelClasses - model resource classes
     * @param entitiesByID - global map of model resources
     * @returns {*} - Graph model - model suitable for visualization
     */
    static fromJSON(json, modelClasses = {}, entitiesByID = null) {

        //New entities will be auto-generated in the raw JSON format
        this.replaceBorderNodes(json);

        //replace references to templates
        this.replaceReferencesToTemplates(json, modelClasses);

        //create tree resources from templates
        this.expandTreeTemplates(json, modelClasses);

        //create process chains from channel templates
        this.expandChannelTemplates(json, modelClasses);

        //create lyphs that inherit properties from templates
        this.expandLyphTemplates(json.lyphs);

        //create tree instances
        this.createTreeInstances(json, modelClasses);

        //create channel instances
        this.createChannelInstances(json, modelClasses);

        //create graph resource
        let res  = super.fromJSON(json, modelClasses, entitiesByID);

        //copy nested references to resources to the parent group
        res.mergeSubgroupEntities();

        //Add conveying lyphs to groups that contain links
        res.links.forEach(link => {
            if (link.conveyingLyph && !res.lyphs.find(lyph => lyph.id === link.conveyingLyph.id)){
                res.lyphs.push(link.conveyingLyph);
            }
        });

        //validate process edges
        res.validateProcessEdges();

        //Assign color to visual resources with no color in the spec
        addColor(res.regions, "#c0c0c0");
        addColor(res.links, "#000");
        addColor(res.lyphs);

        return res;
    }

    /**
     * Replace references to lyph templates with references to auto-generated lyphs that inherit properties from templates
     * @param json - input model
     * @param modelClasses - model resource classes
     */
    static replaceReferencesToTemplates(json, modelClasses){

        let changedLyphs = 0;
        let changedMaterials = 0;

        const replaceRefToMaterial = (ref) => {
            const prefix = "lyphMat_";
            let template = (json.lyphs || []).find(e => (e.id === prefix + ref) && e.isTemplate);
            if (!template){
                let material = (json.materials || []).find(e => e.id === ref);
                if (material) {
                    template = {
                        "id"            : prefix + material.id,
                        "name"          : material.name,
                        "isTemplate"    : true,
                        "materials"     : [material.id],
                        "generatedFrom" : material.id,
                        "generated"     : true
                    };
                    template::merge(material::pick(["name", "external", "color"]));
                    json.lyphs.push(template);
                }
            }
            if (template){
                return template.id;
            }
            return ref;
        };

        const replaceRefToTemplate = (ref, parent) => {
            let template = (json.lyphs || []).find(e => e.id === ref && e.isTemplate);
            if (template) {
                changedLyphs++;
                let subtype = {
                    "id"       : ref + "_" + parent.id,
                    "name"     : template.name,
                    "supertype": template.id,
                    "generated": true
                };
                json.lyphs.push(subtype);
                replaceAbstractRefs(subtype, "layers");
                return subtype.id;
            }
            return ref;
        };

        const replaceAbstractRefs = (resource, key) => {
            if (!resource[key]) { return; }
            const replaceLyphTemplates = !["subtypes", "supertype", "lyphTemplate", "housingLyphs", "lyphs"].includes(key);
            if (resource[key]::isArray()) {
                resource[key] = resource[key].map(ref => replaceRefToMaterial(ref));
                if (replaceLyphTemplates){
                    resource[key] = resource[key].map(ref => replaceRefToTemplate(ref, resource));
                }
            } else {
                resource[key] = replaceRefToMaterial(resource[key]);
                if (replaceLyphTemplates) {
                    resource[key] = replaceRefToTemplate(resource[key], resource);
                }
            }
        };

        (json::entries()||[]).forEach(([groupRelName, resources]) => {
            if (!resources::isArray()) { return; }
            let groupClassNames = this.Model.relClassNames;
            if (groupClassNames[groupRelName]) {
                let refsToLyphs = modelClasses[groupClassNames[groupRelName]].Model.selectedRelNames("Lyph");
                if (!refsToLyphs){ return; }
                (resources || []).forEach(resource => {
                    (resource::keys() || []).forEach(key => { // Do not replace valid references to templates
                        if (refsToLyphs.includes(key)) { replaceAbstractRefs(resource, key); }
                    })
                })
            }
        });
        if (changedLyphs > 0){
            logger.info("Replaced references to lyph templates:", changedLyphs);
        }
        if (changedMaterials > 0){
            logger.info("Replaced references to materials:", changedMaterials);
        }
    }

    /**
     * Generate canonical omega trees from tree templates, i.e. auto-create necessary nodes and links, and copy tree template to all tree levels
     * @param json - input model
     * @param modelClasses - model resource classes
     */
    static expandTreeTemplates(json, modelClasses){
        if (!modelClasses){ return; }
        (json.trees||[]).forEach((tree, i) => {
                tree.id = tree.id || (json.id + "_tree_" + i);
                modelClasses.Tree.expandTemplate(json, tree);
            }
        );
    }

    /**
     * Generate process chains from channel templates, i.e. auto-create necessary nodes and links, and assign conveying lyphs of certain structure
     * @param json - input model
     * @param modelClasses - model resource classes
     */
    static expandChannelTemplates(json, modelClasses){
        if (!modelClasses){ return; }
        (json.channels||[]).forEach((channel, i) => {
                channel.id = channel.id || (json.id + "_channel_" + i);
                modelClasses.Channel.expandTemplate(json, channel);
            }
        );
    }

    /**
     * Generate omega tree instances
     * @param json - input model
     * @param modelClasses - model resource classes
     */
    static createTreeInstances(json, modelClasses){
        if (!modelClasses){ return; }
        (json.trees||[]).forEach(tree => {
            if (!tree.group) { return; }
            modelClasses.Tree.createInstances(json, tree);
        });
    }

    /**
     * Create channel instances
     * @param json - input model
     * @param modelClasses - model resource classes
     */
    static createChannelInstances(json, modelClasses){
        if (!modelClasses){ return; }
        (json.channels||[]).forEach(channel => {
            if (!channel.group) { return; }
            modelClasses.Channel.createInstances(json, channel);
        });
    }

    /**
     * Create empty group to accumulate resources generated from a template
     * @param template - tree or channel template
     * @param parentGroup - parent group
     */
    static createTemplateGroup(template, parentGroup){
        let group = template.group || {};
        group::defaults({
            "id"        : "group_" + template.id,
            "name"      : template.name,
            "generated" : true
        });
        ["links", "nodes", "lyphs"].forEach(prop => {
            group[prop] = group[prop] || [];
            if ( group[prop].length > 0){
                logger.warn(`Generated group contains extra ${prop}: ${group[prop]}!`)
            }
        });

        if (!parentGroup.groups) { parentGroup.groups = []; }
        parentGroup.groups.push(group);
        return group;
    }


    /**
     * Create lyphs that inherit properties from templates
     * @param lyphs
     */
    static expandLyphTemplates(lyphs){
        let templates = (lyphs||[]).filter(lyph => lyph.isTemplate);
        templates.forEach(template => Lyph.expandTemplate(lyphs, template));
    }

    /**
     * Replicate border nodes and create collapsible links
     * The effect of this procedure depends on the order in which lyphs that share border nodes are selected
     * If the added dashed links create an overlap, one has to change the order of lyphs in the input file!
     * @param json - group model defined by user
     */
    static replaceBorderNodes(json){
        let borderNodesByID = {};
        let lyphsWithBorders = (json.lyphs||[]).filter(lyph => lyph.border && (lyph.border.borders||[])
            .find(b => b && b.hostedNodes)); //TODO if link's reference is used this will fail
        lyphsWithBorders.forEach(lyph => {
            lyph.border.borders.forEach(b => {
                (b.hostedNodes||[]).forEach(nodeID => {
                    if (!borderNodesByID[nodeID]){ borderNodesByID[nodeID] = []; }
                    borderNodesByID[nodeID].push(lyph);
                });
            })
        });

        borderNodesByID::keys().forEach(nodeID => {
            if (borderNodesByID[nodeID].length > 1){
                //links affected by the border node constraints
                let links = (json.links||[]).filter(e => e.target === nodeID);
                let node  = (json.nodes||[]).find(e => e.id === nodeID);
                //Unknown nodes will be detected by validation later, no need for logging here
                if (!node){return;}

                for (let i = 1, prev = nodeID; i < borderNodesByID[nodeID].length; i++){
                    let nodeClone = node::cloneDeep()::merge({
                        "id"       : nodeID + `_${i}`,
                        "cloneOf"  : nodeID,
                        "class"    : "Node",
                        "generated": true
                    });
                    if (!node.clones){ node.clones = []; }
                    node.clones.push(nodeClone.id);
                    json.nodes.push(nodeClone);

                    links.forEach(lnk => {lnk.target = nodeClone.id});
                    //lyph constraint - replace
                    borderNodesByID[nodeID][i].border.borders.forEach(b => {
                        let k = (b.hostedNodes||[]).indexOf(nodeID);
                        if (k > -1){ b.hostedNodes[k] = nodeClone.id; }
                    });
                    //create a collapsible link
                    let lnk = {
                        "id"         : `${prev}_${nodeClone.id}`,
                        "source"     : `${prev}`,
                        "target"     : `${nodeClone.id}`,
                        "stroke"     : LINK_STROKE.DASHED,
                        "length"     : 1,
                        "collapsible": true,
                        "generated"  : true
                    };
                    json.links.push(lnk);
                    prev = nodeClone.id;
                }
            }
        });
    }

    /**
     * Add entities from subgroups to the current group
     */
    mergeSubgroupEntities(){

        (this.groups||[]).forEach(group => {
            if (group.id === this.id || (this.inGroups||[]).find(e => e.id === group.id)) {
                logger.warn("The model contains self-references or cyclic group dependencies: ", this.id, group.id);
                return;
            }
            let relFieldNames = this.constructor.Model.filteredRelNames(this.constructor.Model.groupClsNames);
            relFieldNames.forEach(property => {
                this[property] = (this[property]||[])::unionBy(group[property], "id");
            this[property] = this[property].filter(x => x.class);
            });
        });

        //Add auto-created clones of boundary nodes to relevant groups
        (this.nodes||[]).filter(node => node && node.clones).forEach(node => {
            node.clones.forEach(clone => {
                this.nodes.push(clone);
                if (clone.hostedBy) {
                    clone.hostedBy.hostedNodes = clone.hostedBy.hostedNodes || [];
                    clone.hostedBy.hostedNodes.push(clone);
                }
            });
        });
    }

    /**
     * Validate process edges
     */
    validateProcessEdges(){
        (this.links||[]).forEach(lnk => {
            if (lnk.conveyingLyph){
                let layers = lnk.conveyingLyph.layers || [lnk.conveyingLyph];
                if (layers[0] && layers[0].materials){
                    if (lnk.conveyingType === PROCESS_TYPE.ADVECTIVE){
                        if (!lnk.conveyingMaterials || lnk.conveyingMaterials.length === 0){
                            lnk.conveyingMaterials = layers[0].materials;
                        } else {
                            let diff = (layers[0].materials || []).filter(x => !(lnk.conveyingMaterials||[]).find(e => e.id === x.id));
                            if (diff.length > 0){
                                logger.log("Incorrect advective process: not all innermost layer materials of the conveying lyph are conveyed by the link", lnk, diff);
                            }
                        }
                    } else {
                        let nonConveying = (lnk.conveyingMaterials||[]).filter(x => !(layers[0].materials || []).find(e => e.id === x.id));
                        if (nonConveying.length > 0){
                            logger.warn("Incorrect diffusive process: materials are not conveyed by the innermost layer of the conveying lyph:", lnk, nonConveying);
                        }
                    }
                }
            }
        });
    }

    /**
     * Entities that belong to the group (resources excluding subgroups)
     * @returns {*[]}
     */
    get resources(){
        let res = [];
        let relFieldNames = this.constructor.Model.filteredRelNames(this.constructor.Model.groupClsNames); //Exclude groups
        relFieldNames.forEach(property => res = res::unionBy((this[property] ||[]), "id"));
        return res.filter(e => !!e && e::isObject());
    }

    /**
     * Show subgroups of the current group. A resources is shown if it belongs to at least one visible subgroup
     * @param groups - selected subgroups
     */
    showGroups(groups){
        this.show(); //show all entities that are in the main group
        (this.groups || []).filter(group => !groups.has(group)).forEach(g => g.hide()); //hide entities from hidden groups
        (this.groups || []).filter(group => groups.has(group)).forEach(g => g.show()); //show entities that are in visible groups
    }

    /**
     * Hide current group (=hide all its entities)
     */
    hide(){
        this.resources.forEach(entity => entity.hidden = true);
    }

    /**
     * Show current group (=show all its entities)
     */
    show(){
        this.resources.forEach(entity => delete entity.hidden);
    }

    /**
     * Get groups that can be toggledon or off in the global graph
     * @returns {T[]}
     */
    get activeGroups(){
        return [...(this.groups||[])].filter(e => !e.inactive);
    }

    get visibleRegions(){
        return (this.regions||[]).filter(e => e.isVisible);
    }

    get visibleNodes(){
        return (this.nodes||[]).filter(e => e.isVisible ||
            e.sourceOf && e.sourceOf.isVisible ||
            e.targetOf && e.targetOf.isVisible
        );
    }

    get visibleLinks(){
        return (this.links||[]).filter(e => e.isVisible);
    }

    get visibleLyphs(){
       return (this.lyphs||[]).filter(e => e.isVisible && e.axis && e.axis.isVisible);
    }

    get create3d(){
        return (this.lyphs||[]).find(e => e.create3d);
    }

    /**
     * Experimental - export visible object positions (or points)
     */
    // export(){
    //     const getCoords = (obj) => ({"x": Math.round(obj.x), "y": Math.round(obj.y), "z": Math.round(obj.z)});
    //
    //     return {
    //         regions: this.visibleRegions.map(region => ({
    //             "id"     : region.id,
    //             "points" : (region.points || []).map(p => getCoords(p)),
    //             "center" : getCoords(region.center)
    //         })),
    //         lyphs: this.visibleLyphs.map(lyph => ({
    //             "id"     : lyph.id,
    //             "points" : (lyph.points || []).map(p => getCoords(p)),
    //             "center" : getCoords(lyph.center)
    //         })),
    //         nodes: this.visibleNodes.map(node => ({
    //             "id"     : node.id,
    //             "center" : getCoords(node)
    //         })),
    //         links: this.visibleLinks.map(link => ({
    //             "id"     : link.id,
    //             "source" : link.source.id,
    //             "target" : link.target.id,
    //             "points" : (link.points || []).map(p => getCoords(p))
    //         }))
    //     };
    // }




}

