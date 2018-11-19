import { merge, defaults, isObject, isArray, isString, isNumber, entries, keys, assign, cloneDeep } from 'lodash-bound';
import { definitions }  from '../data/graphScheme.json';
import { SpriteText2D } from 'three-text2d';
import { assignPropertiesToJSONPath, copyCoords, JSONPath } from './utils.js';
import * as colorSchemes from 'd3-scale-chromatic';

/**
 * A helper function that returns true if the JSON Schema specification contains a nested object definition
 * @param spec
 */
const isNestedObj = (spec) => (spec.type === "object" && spec.properties) || spec.items && isNestedObj(spec.items);

/**
 * Extracts class name from the schema definition
 * @param spec - schema definition
 */
export const getClassName = (spec) => {
    let classDef = spec.$ref || (spec.oneOf || spec.anyOf || []).find(obj => obj.$ref) || spec;
    if (!classDef) { return; }
    if (classDef.$ref){ classDef = classDef.$ref;}
    if (!classDef.substr){
        console.error("Class definition is not a string", classDef);
    }
    return classDef.substr(classDef.lastIndexOf("/") + 1).trim();
};

/**
 * Selects schema definitions which contain as an option a reference to a model object
 * @param spec - schema definition
 */
const isReference = (spec) => spec.$ref
    || (spec.oneOf||[]).find(e => isReference(e))
    || (spec.anyOf||[]).find(e => isReference(e))
    || spec.items && isReference(spec.items)
;

const extendsEntity = (spec) => {
    let ref = isReference(spec);
    if (ref){
        let clsName = getClassName(ref);
        if (clsName === "Entity") { return true; }
        if (clsName){
            let def = definitions[clsName];
            return def && def.extends && extendsEntity(def.extends);
        }
    }
    return false;
};

/**
 * Auto-complete the model with bidirectional references
 * @param res  - input model
 * @param key  - property to auto-complete
 * @param spec - property specification
 */
const syncRelationships = (res, [key, spec]) => {
    if (!res[key]){ return; }
    if (!res[key]::isObject()){
        console.warn("Object ID has not been replaced with a reference", res[key]);
        return;
    }
    let key2 = spec.relatedTo;
    if (key2){
        let typeSpec = spec.items || spec;
        let otherClassName = getClassName(typeSpec);
        if (!otherClassName) {
            console.error("Class not defined: ", typeSpec);
            return;
        }

        let otherTypeSpec = definitions[otherClassName].properties[key2];
        if (!otherTypeSpec){
            console.error(`Property specification '${key2}' is not found in class:`, otherClassName);
            return;
        }

        const syncProperty = (obj) => {
            if (otherTypeSpec.type === "array"){
                if (!obj[key2]) { obj[key2] = []; }
                if (!obj[key2]::isArray()){
                    console.error(`Object's property '${key2}' should contain an array:`, obj);
                    return;
                }
                if (!obj[key2].find(obj2 => obj2 === obj || obj2 === obj.id)){ obj[key2].push(res); }
            } else {
                if (!obj[key2]) { obj[key2] = res; }
                else {
                    if (obj[key2] !== res && obj[key2] !== res.id){
                        console.warn(`First object's value of '${key}' should match second object's value of '${key2}'`,
                            res, obj[key2]);
                    }
                }
            }
        };

        if (res[key]::isArray()){
            res[key].forEach(obj => syncProperty(obj))
        } else {
            syncProperty(res[key]);
        }
    }
};

/**
 * Replace IDs with objec references
 * @param res - input model
 * @param modelClasses - recognized entity classes
 * @param entitiesByID - map of all entities
 */
const replaceIDs = (res, modelClasses, entitiesByID) => {

    const createObj = (value, spec) => {

        if (value::isNumber()) { value = value.toString(); }

        let objValue = value;
        let clsName = getClassName(spec);
        if (!clsName){
            console.warn("Cannot extract the object class: property specification does not imply a reference",
                spec, value);
            return objValue;
        }

        if (!definitions[clsName] || definitions[clsName].abstract){ return objValue; }
        if (value::isString()) {
            if (!entitiesByID[value]) {
                entitiesByID[value] = {"id": value};
                console.info(`Auto-created new ${clsName} for ID: `, value);
            }
            objValue = entitiesByID[value];
        }

        if (modelClasses[clsName]) {
            if (!(objValue instanceof modelClasses[clsName])) {
                if (!(entitiesByID[objValue.id] instanceof modelClasses[clsName])) {
                    objValue = modelClasses[clsName].fromJSON(objValue, modelClasses, entitiesByID);
                    entitiesByID[objValue.id] = objValue;
                } else {
                    objValue = entitiesByID[objValue.id]
                }
            }
        } else {
            //If the object does not need to be instantiated, we leave it unchanged but replace its inner references
            let refFields = modelClasses[clsName].Model.relationships;
            (refFields||[]).forEach(f => replaceRefs(objValue, f));
        }
        return objValue;
    };

    const replaceRefs = (res, [key, spec]) => {
        if (!res[key]){ return; }
        if (res[key].class && (res[key] instanceof modelClasses[res[key].class])) { return; }

        let typeSpec = spec.items || spec;
        if (res[key]::isArray()){
            if (spec.type !== "array"){
                console.warn("Model parameter does not expect multiple values: ", key, res[key]);
                return;
            }
            res[key] = res[key].map(value => createObj(value, typeSpec) ||  value);
        } else {
            res[key] = createObj(res[key], typeSpec) || res[key];
            if (spec.type === "array"){
                //The spec allows multiple values, replace object with array of objects
                res[key] = [res[key]];
            }
        }
    };

    //Replace IDs with model object references
    let refFields = modelClasses[res.class].Model.relationships;
    refFields.forEach(f => replaceRefs(res, f));

    //Assign dynamic group properties to all relevant entities
    assignPathProperties(res, modelClasses, entitiesByID);

    //Cross-reference objects from related properties, i.e. Link.hostedNodes <-> Node.hostedByLink
    refFields.forEach(f => syncRelationships(res, f));

    //Interpolation schemes do not contain IDs/references, we process them in the expanded model
    interpolatePathProperties(res);
};

/**
 * Assigns specified properties to the entities defined by the JSONPath expression
 * @param parent - root entity to which the JSONPath expression applies to
 * @param modelClasses - a map of entity class names and their implementations
 * @param entitiesByID - a map of all entities in the model
 */
const assignPathProperties = (parent, modelClasses, entitiesByID) => {
    //Do not process template assignment, this has been done at preprocessing stage
    if (parent.isTemplate) { return; }

    if (parent.assign) {
        if (!parent.assign::isArray()){
            console.warn("Cannot assign path properties: ", parent.assign);
            return;
        }
        parent.assign.forEach(({path, value}) => {
                assignPropertiesToJSONPath({path, value}, parent, (e) => {
                    //Replace assigned references
                    let needsUpdate = false;
                    value::keys().forEach(key => {
                        let spec = definitions[e.class];
                        if (spec && spec.properties[key] && isReference(spec.properties[key])){
                            needsUpdate  = true;
                            return;
                        }
                    });
                    if (needsUpdate){ replaceIDs(e, modelClasses, entitiesByID); }
                })
            }
        );
    }
};

/**
 * Assigns properties that can be set using interpolation functions allowed by the schema
 * @param parent
 */
const interpolatePathProperties = (parent) => {
    (parent.interpolate||[]).forEach(({path, offset, color}) => {
        let entities = path? JSONPath({json: parent, path: path}): parent.nodes || [];
        if (offset){
            offset::defaults({
                "start": 0,
                "end": 1,
                "step": (offset.end - offset.start) / (entities.length + 1)
            });
            entities.forEach((e, i) => e.offset = offset.start + offset.step * ( i + 1 ) );
        }
        if (color){
            let {scheme, length, reversed = false, offset} = color;
            if (!colorSchemes[scheme]) {
                console.warn("Unrecognized color scheme: ", scheme);
                return;
            }
            if (!length) { length = entities.length; }
            if (!offset) { offset = 0; }

            const getColor = i => colorSchemes[scheme](((reversed)? 1 - offset - i / length : offset + i / length));
            const assignColor = items => {
                (items||[]).forEach((item, i) => {
                    if (!item::isObject()) {
                        console.warn("Cannot assign color to a non-object value");
                        return;
                    }
                    //If entity is an array, the schema is applied to each of it's items
                    if (item::isArray()){
                        assignColor(item);
                    } else {
                        item.color = getColor(i);
                    }
                });
            };
            assignColor(entities);
        }
    })
};

/**
 * Returns recognized class properties from the specification with default values
 * @param className
 */
const getFieldDefaultValues = (className) => {
    const getDefault = (specObj) => specObj.type ?
            specObj.type == "string" ? "" : specObj.type === "boolean" ? false : specObj.type === "number" ? 0 : null
        : null;
    const initValue = (specObj) => {
        return specObj.default?
            (specObj.default::isObject()
                ? specObj.default::cloneDeep()
                : specObj.default )
            : getDefault(specObj);
    };

    return definitions[className].properties::entries().map(([key, value]) => ({[key]: initValue(value)}));
};

/**
 * Recursively applies a given operation to the classes in schema definitions
 * @param className - initial class
 * @param handler - function to apply to the current class
 */
const recurseSchema = (className, handler) => {
    let currName = className;
    while (definitions[currName]){
        handler(currName);
        if (definitions[currName].extends){
            let ref = definitions[currName].extends["$ref"];
            currName = ref.substr(ref.lastIndexOf("/") + 1).trim();
        } else {
            currName = null;
        }
    }
};

/**
 * Common methods for all entity models
 */
export class Entity {

    constructor(id) {
        this.id = id;
        this::merge(this.constructor.Model.defaultValues);
    }

    /**
     * Create Entity model from the JSON specification
     * @param json - input model
     * @param modelClasses - recognized classes
     * @param entitiesByID - map of all model entities
     * @returns {Entity} - Entity model
     */
    static fromJSON(json, modelClasses = {}, entitiesByID = null, border = false) {
        //Do not expand templates
        let clsName = json.class || this.name;
        const cls = this || modelClasses[clsName];
        const res = new cls(json.id);
        res.class = clsName;
        res.JSON = json; //Store original JSON model definition

        //spec
        let difference = json::keys().filter(x => !this.Model.fieldNames.find(y => y === x));
        if (difference.length > 0) {
            console.warn(`Unknown parameter(s) in class ${this.name} may be ignored: `, difference.join(","));
        }

        res::assign(json);

        if (entitiesByID){
            //Exclude just created entity from being ever created again in the following recursion
            if (!res.id) {
                if (!res.class.startsWith("Border")){ console.warn("An entity without ID has been found: ", res); }
            } else {
                if (res.id::isNumber){ res.id = res.id.toString(); }
                if (!entitiesByID[res.id]){ console.info("Added new entity to the global map: ", res.id); }
                entitiesByID[res.id] = res; //Update the entity map
            }

            replaceIDs(res, modelClasses, entitiesByID);
        }

        if (border){
            res.border      = res.border || {};
            res.border.id   = res.border.id || "b_" + res.id;
            res.border      = modelClasses["Border"].fromJSON(res.border);
            res.border.host = res;
        }

        return res;
    }

    //Model schema properties
    static get Model() {
        let model = {};
        if (!definitions[this.name]) {
            console.error("Could not find schema definition for class: ", this.name);
            return model;
        }
        model.schema            = definitions[this.name];
        model.defaultValues     = (() => { //object
            let res = {};
            recurseSchema(this.name, (currName) => res::merge(...getFieldDefaultValues(currName)));
            return res;
        })();
        model.fields            = (() => {
            let res = {};
            recurseSchema(this.name, (currName) => res::merge(...definitions[currName].properties::entries()
                .map(([key, value]) => ({[key]: value})))
            );
            return res::entries();
        })();
        model.fieldNames        = model.fields.map(e => e[0]);
        model.relationships     = model.fields.filter(e => extendsEntity(e[1]));
        model.relationshipNames = model.relationships.map(e => e[0]);
        model.properties        = model.fields.filter(e => !extendsEntity(e[1]));
        model.propertyNames     = model.properties.map(e => e[0]);
        return model;
    }

    get isVisible(){
        return !this.hidden;
    }

    get polygonOffsetFactor() {
        return 0;
    }

    toggleBorder(){
        if (!this.viewObjects || !this.viewObjects['main']) { return; }
        if (this.viewObjects['border']){
            if (this.viewObjects['main'].children.find(this.viewObjects['border'])){
                this.viewObjects['main'].children.remove(this.viewObjects['border']);
            } else {
                this.viewObjects['main'].add(this.viewObjects['border']);
            }
        }
    }

    createLabels(labelKey, fontParams){
        if (this.skipLabel) { return; }
        this.labels = this.labels || {};

        if (!this.labels[labelKey] && this[labelKey]) {
            this.labels[labelKey] = new SpriteText2D(this[labelKey], fontParams);
        }

        if (this.labels[labelKey]){
            this.viewObjects["label"] = this.labels[labelKey];
            this.viewObjects["label"].visible = this.isVisible;
        } else {
            delete this.viewObjects["label"];
        }
    }

    /**
     * Updates visual labels
     * @param labelKey  - object property to use as label
     * @param isVisible - a boolean flag to toggle the label
     * @param position  - label's position wrt the visual object
     */
    updateLabels(labelKey, isVisible, position){
        if (this.skipLabel) { return; }
        if (this.labels[labelKey]){
            this.viewObjects['label'] = this.labels[labelKey];
            this.viewObjects["label"].visible = isVisible;
            copyCoords(this.viewObjects["label"].position, position);
        } else {
            delete this.viewObjects['label'];
        }
    }

    toJSON(){

    }
}

