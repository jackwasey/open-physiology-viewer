import {NgModule, Component, Input, Output, EventEmitter} from '@angular/core';
import {MatMenuModule} from "@angular/material/menu";
import {CommonModule} from "@angular/common";
import {ResourceDeclarationModule} from "./gui/resourceDeclarationEditor";
import {SearchAddBarModule} from "./gui/searchAddBar";
import {MatButtonModule} from '@angular/material/button';
import {MatDividerModule} from "@angular/material/divider";
import {LyphTreeViewModule} from "./gui/lyphTreeView";
import {cloneDeep, omit, sortBy, values, isObject, isNumber} from 'lodash-bound';
import {$Field, $SchemaClass} from "../model";
import {LyphDeclarationModule} from "./gui/lyphDeclarationEditor";
import FileSaver from 'file-saver';
import {MatSnackBar, MatSnackBarConfig} from '@angular/material/snack-bar';
import {clearMaterialRefs, replaceMaterialRefs} from "./gui/utils";

/**
 * @class
 * @classdesc This is a lyph, material, or reference to undefined lyph to display in lyph tree viewer
 * @property id
 * @property label
 * @property type
 * @property parent
 * @property length
 * @property children
 * @property isTemplate
 * @property index
 * @property resource
 * @property icons
 * @property layerIndex
 * @property maxLayerIndex
 * @property inherited
 */
export class Node {
    constructor(id, label, type, parent, length, children, isTemplate, index, resource) {
        this.id = id;
        this.label = label;
        this.parent = parent;
        this.length = length;
        this.children = children;
        this.isTemplate = isTemplate;
        this.type = type;
        this.index = index;
        this.resource = resource;
        this.icons = [];
        this.canMoveUp = index > 0 && this.length > 1;
        this.canMoveDown = index < this.length - 1;
        if (this.resource?.hasOwnProperty($Field.internalInLayer)) {
            this.layerIndex = this.resource.internalInLayer;
        }
        if (this.parent?.internalLyphs && this.parent?.internalLyphsInLayers) {
            if (this.index < this.parent?.internalLyphsInLayers.length) {
                this.layerIndex = this.parent.internalLyphsInLayers[this.index];
            }
        }
    }
}

const ICON = {
    LAYERS: "fa fa-bars",
    INTERNAL: "fa fa-building-o",
    INHERITED: "fa fa-lock"
}

@Component({
    selector: 'lyphEditor',
    template: `
        <section #lyphEditorD3 id="lyphEditorD3" class="w3-row">
            <section #lyphView id="lyphView" [class.w3-threequarter]="showPanel">
                <section class="w3-col">
                    <lyphTreeView
                            title="Lyphs"
                            [active]="activeTree === 'lyphTree'"
                            [treeData]="lyphTree"
                            [selectedNode]="selectedNode"
                            (onNodeClick)="selectLyph($event)"
                            (onChange)="processChange($event)"
                    >
                    </lyphTreeView>
                </section>
                <section class="w3-col">
                    <lyphTreeView *ngIf="selectedLyph"
                                  title="Layers"
                                  ordered="true"
                                  [active]="activeTree === 'layerTree'"
                                  [treeData]="layerTree"
                                  (onNodeClick)="selectLayer($event)"
                                  (onChange)="processLayerChange($event)"
                    >
                    </lyphTreeView>
                </section>
                <section class="w3-col">
                    <lyphTreeView *ngIf="selectedLyph"
                                  title="Internal lyphs"
                                  [active]="activeTree === 'internalTree'"
                                  [treeData]="internalTree"
                                  [showLayerIndex]="true"
                                  (onNodeClick)="selectInternal($event)"
                                  (onChange)="processInternalChange($event)"
                                  (onLayerIndexChange)="processInternalInLayerChange($event)"
                    >
                    </lyphTreeView>
                </section>
                <section class="w3-padding-right" style="position:relative;">
                    <section class="w3-bar-block w3-right vertical-toolbar" style="position:absolute; right:0">
                        <button class="w3-bar-item w3-hover-light-grey"
                                (click)="createLyph()" title="New lyph">
                            <i class="fa fa-file-pen"> </i>
                        </button>
                        <button class="w3-bar-item w3-hover-light-grey"
                                (click)="preview()" title="Preview">
                            <i class="fa fa-magnifying-glass"> </i>
                        </button>
                        <mat-divider></mat-divider>
                        <button [disabled]="!canUndo" class="w3-bar-item"
                                (click)="undo()" [title]="undoTitle">
                            <i class="fa fa-rotate-left"> </i>
                        </button>
                        <button [disabled]="!canRedo" class="w3-bar-item"
                                (click)="redo()" [title]="redoTitle">
                            <i class="fa fa-rotate-right"> </i>
                        </button>
                        <button *ngIf="!showPanel" class="w3-bar-item w3-hover-light-grey"
                                (click)="showPanel = !showPanel" title="Show settings">
                            <i class="fa fa-cog"> </i>
                        </button>
                        <button *ngIf="showPanel" class="w3-bar-item w3-hover-light-grey"
                                (click)="showPanel = !showPanel" title="Hide settings">
                            <i class="fa fa-window-close"> </i>
                        </button>
                        <button class="w3-bar-item w3-hover-light-grey" (click)="saveChanges()"
                                title="Apply changes">
                            <i class="fa fa-check"> </i>
                        </button>
                    </section>
                </section>
            </section>
            <section *ngIf="showPanel" class="w3-quarter">
                <searchAddBar
                        [searchOptions]="searchOptions"
                        [selected]="lyphToLink?.id"
                        (selectedItemChange)="selectBySearch($event)"
                        (addSelectedItem)="addLyph($event)"
                >
                </searchAddBar>
                <lyphDeclaration
                        [lyph]="selectedLyphToEdit"
                        [regionNames]="regionNames"
                        (onValueChange)="updateProperty($event)"
                >
                </lyphDeclaration>
            </section>
        </section>
    `,
    styles: [`
        #lyphView {
            display: flex;
            justify-content: space-between;
        }
    `]
})
/**
 * @class
 * @property entitiesByID
 */
export class LyphEditorComponent {
    _model;
    _searchOptions;
    _snackBar;
    _snackBarConfig = new MatSnackBarConfig();
    steps = [];
    currentStep = 0;

    showPanel = true;
    entitiesByID = {};
    lyphTree = [];
    internalTree = [];
    layerTree = [];

    @Input('model') set value(newModel) {
        this._model = newModel::cloneDeep();
        this.steps = [];
        this.currentStep = 0;
        this.prepareLyphTree();
        this.updateView(null, 'lyphTree');
        this.updateRegionOptions();
        this.saveStep('Initial model');
    };

    @Output() onChangesSave = new EventEmitter();

    constructor(snackBar: MatSnackBar) {
        this._snackBar = snackBar;
        this._snackBarConfig.panelClass = ['w3-panel', 'w3-orange'];
    }

    /**
     * Select lyph to connect via search menu
     * @param nodeLabel
     */
    selectBySearch(nodeLabel) {
        if (!nodeLabel && this.lyphToLink) {
            this.lyphToLink = null;
        } else {
            let nodeID = nodeLabel.substring(
                nodeLabel.indexOf("(") + 1,
                nodeLabel.lastIndexOf(")")
            );
            this.lyphToLink = this.entitiesByID[nodeID];
        }
    }

    /**
     * Create a new lyph definition
     * @returns {{[p: string]: *, _class: *}}
     */
    defineNewLyph() {
        let newLyphCounter = 1;
        let newLyphID = "_newLyph" + newLyphCounter;
        while (this.entitiesByID[newLyphID]) {
            newLyphID = "_newLyph" + ++newLyphCounter;
        }
        let newLyph = {
            [$Field.id]: newLyphID,
            [$Field.name]: "New lyph " + newLyphCounter,
            "_class": $SchemaClass.Lyph
        }
        this._model.lyphs = this._model.lyphs || [];
        this._model.lyphs.push(newLyph);
        this.entitiesByID[newLyph.id] = newLyph;
        return newLyph;
    }

    /**
     * Pass given lyph to dependent components to display and edit its relations and properties
     * @param selectedLyph
     * @param activeTree
     */
    updateView(selectedLyph, activeTree) {
        let lyph = selectedLyph ? selectedLyph : (this.lyphTree.length > 0) ? this.lyphTree[0].resource : null;
        this.selectedLyph = lyph;
        this.selectedLyphToEdit = lyph;
        this.prepareLayerTree();
        this.prepareInternalTree();
        this.updateSearchOptions();
        this.lyphToLink = null;
        this.activeTree = activeTree;
    }

    /**
     * Create a new lyph
     */
    createLyph() {
        let lyph = this.defineNewLyph();
        let node = this._createLyphNode(lyph);
        this.lyphTree = [node, ...this.lyphTree];
        this.selectedNode = node;
        this.updateView(lyph, 'lyphTree');
        this.saveStep("Create new lyph " + lyph.id);
    }

    /**
     * Add a given lyph as layer or internal lyph
     * @param lyphID
     */
    addLyph(lyphID) {
        let lyph = this.entitiesByID[lyphID];
        if (lyph) {
            if (this.selectedLyph) {
                if (this.activeTree === 'layerTree') {
                    this.addLayer(this.selectedLyph);
                } else {
                    if (this.activeTree === 'internalTree') {
                        this.addInternal(this.selectedLyph);
                    } else {
                        this.insertSubtype(this.selectedLyph);
                    }
                }
            } else {
                let message = "Cannot add lyph: the parent lyph is not selected!";
                this._snackBar.open(message, "OK", this._snackBarConfig);
            }
        } else {
            let message = "Unknown lyph!";
            this._snackBar.open(message, "OK", this._snackBarConfig);
        }
    }

    /**
     * Create a hierarchy of defined lyphs
     * @returns {({}|Node)[]}
     */
    prepareLyphTree() {
        this.entitiesByID = {};
        //Prepare _subtype/_supertype hierarchy
        (this._model.lyphs || []).forEach(lyph => {
            if (lyph.id) {
                lyph._subtypes = [];
                delete lyph._supertype;
                lyph._class = $SchemaClass.Lyph;
                this.entitiesByID[lyph.id] = lyph;
            }
        });
        (this._model.materials || []).forEach(material => {
            if (material.id) {
                material._class = $SchemaClass.Material;
                this.entitiesByID[material.id] = material;
            }
        });
        (this._model.lyphs || []).forEach(lyph => {
            if (lyph.supertype) {
                let supertype = this.entitiesByID[lyph.supertype];
                if (supertype) {
                    supertype._subtypes = supertype._subtypes || [];
                    supertype._subtypes.push(lyph);
                } else {
                    let message = "No supertype definition found: " + lyph.supertype;
                    this._snackBar.open(message, "OK", this._snackBarConfig);
                }
                lyph._supertype = lyph.supertype;
            }
            (lyph.subtypes || []).forEach(subtype => {
                if (this.entitiesByID[subtype]) {
                    lyph._subtypes.push(this.entitiesByID[subtype]);
                    this.entitiesByID[subtype]._supertype = lyph;
                } else {
                    let message = `No definition found for subtype ${subtype} of ${lyph.id}`;
                    this._snackBar.open(message, "OK", this._snackBarConfig);
                }
            });
        });

        //Recursively create lyph tree nodes
        const mapToNodes = (lyphOrID, parent, idx) => {
            if (!lyphOrID) return {};
            let lyph = lyphOrID.id ? lyphOrID : this.entitiesByID[lyphOrID];
            let length = (parent?._subtypes || []).length || 0;
            let res = this._createLyphNode(lyph, parent, idx, length);
            lyph._node = res;
            if (lyph._subtypes) {
                res.children = lyph._subtypes.map((x, i) => mapToNodes(x, lyph, i));
            }
            if (res.resource?.layers && !res.icons.includes(ICON.LAYERS)) {
                res.icons.push(ICON.LAYERS);
            }
            if (res.resource?.internalLyphs && !res.icons.includes(ICON.INTERNAL)) {
                res.icons.push(ICON.INTERNAL);
            }
            return res;
        };
        let treeData = (this._model.lyphs || []).filter(e => !e._supertype).map(e => mapToNodes(e));
        this.lyphTree = treeData::sortBy([$Field.id]);
    }

    /**
     * Fast update of lyph tree after single lyph property change
     * @param oldValue
     * @param newValue
     * @param prop
     */
    updateLyphTreeNode(oldValue, newValue, prop) {
        if (oldValue === newValue) {
            return;
        }
        const replaceNode = parent => {
            if (parent[prop] === oldValue) {
                if (newValue === undefined) {
                    delete parent[prop];
                } else {
                    parent[prop] = newValue;
                }
            }
            (parent.children || []).forEach(e => replaceNode(e));
        }
        (this.lyphTree || []).forEach(e => replaceNode(e));
    }

    /**
     * Create lyph tree node for a given ApiNATOMY lyph object or its ID
     * @param lyphOrID - lyph object or its identifier
     * @param parent - lyph's parent in the tree (e.f., supertype)
     * @param idx - position of the node among its siblings
     * @param length - total number of siblings
     * @returns {Node} - generated tree node to display in the mat-tree-based component
     * @private
     */
    _createLyphNode(lyphOrID, parent, idx, length = 0) {
        if (lyphOrID::isObject()) {
            return new Node(lyphOrID.id, lyphOrID.name, lyphOrID._class || $SchemaClass.Lyph, parent, length, [], lyphOrID.isTemplate, idx, lyphOrID);
        } else {
            return new Node(lyphOrID, "Generated " + lyphOrID, "Undefined", undefined, 0, [], false, idx, undefined);
        }
    }

    /**
     * Prepare a list of lyph id-name pairs for search box
     */
    updateSearchOptions() {
        let _searchOptions = (this._model.materials || []).map(e => e.name + ' (' + e.id + ')');
        _searchOptions = _searchOptions.concat((this._model.lyphs || []).map(e => e.name + ' (' + e.id + ')'));
        _searchOptions.sort();
        this.searchOptions = _searchOptions;
    }

    set searchOptions(newOptions){
        this._searchOptions = newOptions;
    }

    get searchOptions(){
        return this._searchOptions;
    }

    /**
     * Prepare a list of scaffold region id-name pairs for search box
     */
    updateRegionOptions() {
        this.regionNames = [];
        (this._model?.scaffolds || []).forEach(scaffold => {
            (scaffold.regions || []).forEach(r => {
                this.regionNames.push((r.name || '?') + ' (' + r.id + ')');
            });
        });
    }

    /**
     * Select an active lyph to see and edit
     * @param node
     */
    selectLyph(node) {
        let nodeID = node::isObject() ? node.id : node;
        if (this.selectedLyph?.id !== nodeID) {
            this.selectedLyph = this.entitiesByID[nodeID];
            this.selectedLyphToEdit = this.selectedLyph;
            this.prepareLayerTree();
            this.prepareInternalTree();
        }
        this.activeTree = 'lyphTree';
    }

    /**
     * Select a layer of the active lyph
     * @param node
     */
    selectLayer(node) {
        let nodeID = node::isObject() ? node.id : node;
        if (this.selectedLyph?.id !== nodeID) {
            this.selectedLyphToEdit = this.entitiesByID[nodeID];
        }
        this.activeTree = 'layerTree';
    }

    /**
     * Select an internal lyph of the active lyph
     * @param node
     */
    selectInternal(node) {
        let nodeID = node::isObject() ? node.id : node;
        if (this.selectedLyph?.id !== nodeID) {
            this.selectedLyphToEdit = this.entitiesByID[nodeID];
        }
        this.activeTree = 'internalTree';
    }

    /**
     * A helper method to prepare a tree hierarchy
     * @param prop - hierarchical relationship, i.e., 'layers' or 'internalLyphs'
     * @param includeInherited - a flag indicating whether to include resources inherited from the supertype
     * @returns {({}|*)[]}
     * @private
     */
    _preparePropertyTree(prop, includeInherited = false) {
        let stack = [];
        let loops = [];

        const mapToNodes = (lyphOrID, parent, idx) => {
            if (!lyphOrID) return {};
            if (parent) {
                stack.push(parent);
            }
            let lyph = lyphOrID.id ? lyphOrID : this.entitiesByID[lyphOrID];
            let length = parent ? (parent[prop] || []).length : 1;
            let res = this._createLyphNode(lyph || lyphOrID, parent, idx, length);
            if (lyph) {
                let loopStart = stack.find(x => x.id === lyph.id);
                //Loop detected
                if (loopStart) {
                    loops.push(lyph.id);
                    console.error("LOOP: ", lyph.id);
                } else {
                    if (lyph[prop]) {
                        res.children = lyph[prop].map((e, i) => mapToNodes(e, lyph, i));
                    }
                    if (includeInherited && lyph.supertype) {
                        let supertype = mapToNodes(lyph.supertype);
                        supertype.children.forEach(c => {
                            c.inherited = true;
                            if (!c.icons.includes(ICON.INHERITED)) {
                                c.icons.push(ICON.INHERITED);
                            }
                        });
                        if (supertype.children) {
                            res.children = res.children.concat(supertype.children);
                        }
                    }
                }
            }
            if (parent) {
                stack.pop();
            }
            return res;
        };

        let tree = [mapToNodes(this.selectedLyph)];
        if (loops.length > 0) {
            let message = "Loop is detected in the " + prop + " tree hierarchy of the following lyphs: " + loops.join(", ");
            this._snackBar.open(message, "OK", this._snackBarConfig);
        }
        return tree;
    }

    /** A helper method to cap the layer index for internal lyph assignment */
    _setMaxLayerIndex() {
        if (this.internalTree?.length > 0 && this.layerTree?.length > 0) {
            (this.internalTree[0].children || []).forEach(c => {
                c.maxLayerIndex = this.layerTree[0].children.length - 1;
            });
        }
    }

    /**
     * Prepare a hierarchy of inherited and own layers
     */
    prepareLayerTree() {
        this.layerTree = this._preparePropertyTree($Field.layers, true);
    }

    /**
     * Prepare a hierarchy of inherited and own internal lyphs
     */
    prepareInternalTree() {
        this.internalTree = this._preparePropertyTree($Field.internalLyphs, true);
        this._setMaxLayerIndex();
    }

    /**
     * Update selected lyph property
     * @param prop
     * @param value
     * @param oldValue
     */
    updateProperty({prop, value, oldValue}) {
        if (!$Field[prop]) {
            let message = "Cannot update unknown property!";
            this._snackBar.open(message, "OK", this._snackBarConfig);
        }
        if (this.selectedLyphToEdit) {
            if (prop === $Field.id) {
                replaceMaterialRefs(this._model, this.selectedLyphToEdit.id, value);
                this.entitiesByID[value] = this.entitiesByID[oldValue];
                delete this.entitiesByID[oldValue];
            }
            if ([$Field.id, $Field.name].includes(prop)) {
                this.updateSearchOptions();
                this.updateLyphTreeNode(oldValue, value, $Field[prop]);
            }
            if (prop === $Field.id) {
                this.prepareLayerTree();
                this.prepareInternalTree();
            } else {
                this.selectedLyphToEdit[prop] = value;
            }
            this.saveStep(`Update property ${prop} of lyph ` + this.selectedLyphToEdit.id);
        }
    }

    //Helper method to create a material/lyph object
    _addDefinition(prop, nodeID) {
        let resource = this.entitiesByID[nodeID];
        resource.name = "Generated " + nodeID;
        resource._class = prop === $Field.lyphs ? $SchemaClass.Lyph : $SchemaClass.Material;
        delete resource._generated;
        this._model[prop] = this._model[prop] || [];
        this._model[prop].push(resource);
    }

    //Helper method to remove material/lyph object
    _removeMaterialOrLyph(nodeID) {
        let idx = (this._model.materials || []).findIndex(m => m.id === nodeID);
        if (idx > -1) {
            this._model.materials.splice(idx, 1);
        } else {
            idx = (this._model.lyphs || []).findIndex(m => m.id === nodeID);
            this._model.lyphs.splice(idx, 1);
        }
        this.updateSearchOptions();
    }

    /**
     * Process menu operation in the main lyph view
     * @param operation - chosen operation
     * @param node - lyph subject
     */
    processChange({operation, node, index}) {
        switch (operation) {
            case 'insert':
                this.insertSubtype(node, index);
                break;
            case 'delete':
                this.deleteLyph(node, index);
                break;
            case 'deleteDef':
                this.deleteDefinition(node, this.lyphTree);
                break;
            case 'removeParent':
                this.removeSupertype(node, index);
                break;
            case 'removeChildren':
                this.removeSubtypes(node, index);
                break;
            case 'defineMaterial':
                this.defineAsMaterial(node, index);
                break;
            case 'defineLyph':
                this.defineAsLyph(node, index);
                break;
        }
    }

    /**
     * Remove supertype from the given lyph
     * @param node
     */
    removeSupertype(node) {
        let lyph = this.entitiesByID[node.id];
        if (lyph) {
            if (lyph._supertype) {
                let supertype = this.entitiesByID[lyph._supertype];
                if (supertype?.subtypes) {
                    supertype.subtypes = supertype.subtypes.filter(e => e.id !== node.id);
                }
            }
            delete lyph.supertype;
            this.prepareLyphTree();
            this.updateView(this.selectedLyph, 'lyphTree');
            this.saveStep("Remove supertype of " + node.id);
        }
    }

    /**
     * Remove subtypes from the given lyph
     * @param node
     */
    removeSubtypes(node) {
        let lyph = this.entitiesByID[node.id];
        if (lyph) {
            (lyph._subtypes || []).forEach(subtype => {
                delete subtype.supertype;
            })
            delete lyph.subtypes;
            this.prepareLyphTree();
            this.updateView(this.selectedLyph, 'lyphTree');
            this.saveStep("Remove subtypes of " + node.id);
        }
    }

    /**
     * Delete lyph definition
     * @param node
     * @param activeTree
     */
    deleteDefinition(node, activeTree) {
        let lyph = this.entitiesByID[node.id];
        if (lyph) {
            this._removeMaterialOrLyph(node.id);
            this.prepareLyphTree();
            this.updateView(this.selectedLyph, activeTree);
            this.saveStep("Delete definition " + node.id);
        }
    }

    /**
     * Delete the lyph from the model
     * @param node
     */
    deleteLyph(node) {
        let material = this.entitiesByID[node.id];
        let cls = material._class?.toLowerCase() || $SchemaClass.Lyph;
        if (material) {
            clearMaterialRefs(this._model, node.id);
            this._removeMaterialOrLyph(node.id);
            this.prepareLyphTree();
        }
        this.updateView(null, 'lyphTree');
        this.saveStep("Delete " + cls + " " + node.id);
    }

    /**
     * Add lyph definition
     * @param node
     */
    defineAsLyph(node) {
        this._addDefinition($Field.lyphs, node.id);
        node.type = $SchemaClass.Lyph;
        this.saveStep("Define as lyph " + node.id);
    }

    /**
     * Add material definition
     * @param node
     */
    defineAsMaterial(node) {
        this._addDefinition($Field.materials, node.id);
        node.type = $SchemaClass.Material;
        this.saveStep("Define as material " + node.id);
    }

    /**
     * Process menu operation in the internal lyphs view
     * @param operation - chosen operation
     * @param node - lyph subject
     * @param index - lyph index
     */
    processInternalChange({operation, node, index}) {
        switch (operation) {
            case 'insert':
                this.addInternal(node);
                break;
            case 'delete':
                this.deleteInternal(node, index);
                break;
            case 'deleteDef':
                this.deleteDefinition(node, this.internalTree);
                break;
            case 'removeParent':
                this.deleteInternal(node, index);
                break;
            case 'removeChildren':
                this.removeAllInternal(node);
                break;
            case 'defineMaterial':
                this.defineAsMaterial(node);
                break;
            case 'defineLyph':
                this.defineAsLyph(node);
                break;
        }
    }

    removeAllInternal(node) {
        let lyph = this.entitiesByID[node.id];
        if (lyph) {
            (lyph.internalLyphs || []).forEach(layer => delete layer.internalIn);
            delete lyph.internalLyphs;
            this.prepareInternalTree();
            if (lyph._node) {
                lyph._node.icons = lyph._node.icons.filter(icon => icon !== ICON.INTERNAL);
            }
            this.saveStep("Remove internal lyphs of " + node.id);
        }
    }

    addInternal(node) {
        let lyph = this.lyphToLink ? this.lyphToLink : this.defineNewLyph();
        let parent = this.entitiesByID[node.id] || this.selectedLyph;
        if (parent) {
            if (parent._class === $SchemaClass.Lyph) {
                if (!this._isValidInternal(parent, lyph)) {
                    let message = "Cannot add this internal lyph to the selected lyph!";
                    this._snackBar.open(message, "OK", this._snackBarConfig);
                } else {
                    parent.internalLyphs = parent.internalLyphs || [];
                    parent.internalLyphs.push(lyph.id);
                    if (lyph !== this.lyphToLink) {
                        let node = this._createLyphNode(lyph);
                        this.lyphTree = [node, ...this.lyphTree];
                    }
                    this.prepareInternalTree();
                    if (parent._node && !parent._node.icons.includes(ICON.INTERNAL)) {
                        parent._node.icons.push(ICON.INTERNAL);
                    }
                    this.saveStep(`Add internal lyph ${lyph.id} to lyph ${parent.id}`);
                }
            } else {
                let message = "Cannot add internal lyph to a resource other than lyph!";
                this._snackBar.open(message, "OK", this._snackBarConfig);
            }
        } else {
            let message = "Cannot add internal: no lyph is selected!";
            this._snackBar.open(message, "OK", this._snackBarConfig);
        }
    }

    /**
     * Delete internal lyph
     * @param node
     * @param index
     */
    deleteInternal(node, index) {
        let parent = node.parent::isObject() ? node.parent : this.entitiesByID[node.parent];
        if (!parent) {
            this.deleteLyph(node);
        } else {
            if (index > -1 && parent.internalLyphs?.length > index) {
                parent.internalLyphs.splice(index, 1);
                let lyph = this.entitiesByID[node.id];
                if (lyph) {
                    delete lyph.internalIn;
                }
                if (parent.internalLyphs.length === 0) {
                    if (parent._node) {
                        parent._node.icons = parent._node.icons.filter(icon => icon !== ICON.INTERNAL);
                    }
                }
            }
            this.prepareInternalTree();
        }
    }

    /**
     * Update 'internalLyphsInLayers' property
     * @param node
     * @param layerIndex
     */
    processInternalInLayerChange({node, layerIndex}) {
        if (node.parent) {
            let parent = this.entitiesByID[node.parent.id];
            let idx = node.index;
            if (!idx::isNumber()) {
                idx = (parent.internalLyphs || []).findIndex(e => e === node.id);
            }
            if (idx > -1) {
                parent.internalLyphsInLayers = parent.internalLyphsInLayers || [];
                if (parent.internalLyphsInLayers.length < idx) {
                    parent.internalLyphsInLayers.length = idx + 1;
                }
                parent.internalLyphsInLayers[idx] = Number(layerIndex);
            }
        }
    }

    /**
     * Process menu operation in the layers view
     * @param operation - chosen operation
     * @param node - lyph subject
     * @param index - lyph position
     */
    processLayerChange({operation, node, index}) {
        switch (operation) {
            case 'insert':
                this.addLayer(node, index);
                break;
            case 'delete':
                this.deleteLayer(node, index);
                break;
            case 'deleteDef':
                this.deleteDefinition(node, this.layerTree);
                break;
            case 'up':
                this.moveLayerUp(node, index);
                break;
            case 'down':
                this.moveLayerDown(node, index);
                break;
            case 'removeParent':
                this.deleteLayer(node, index);
                break;
            case 'removeChildren':
                this.removeLayers(node);
                break;
            case 'defineMaterial':
                this.defineAsMaterial(node);
                break;
            case 'defineLyph':
                this.defineAsLyph(node);
                break;
        }
    }

    removeLayers(node) {
        let lyph = this.entitiesByID[node.id];
        if (lyph) {
            (lyph.layers || []).forEach(layer => delete layer.layerIn);
            delete lyph.layers;
            this.prepareLayerTree();
            if (lyph._node) {
                lyph._node.icons = lyph._node.icons.filter(icon => icon !== ICON.LAYERS);
            }
            this.saveStep("Remove layers of " + node.id);
        }
    }

    _isValidSubtype(parent, child) {
        return parent !== child;
    }

    _isValidLayer(parent, child) {
        const hasTemplateLayers = _parent => {
            let supertype = this.entitiesByID[_parent];
            if (supertype) {
                if ((supertype.layers || []).length > 0) {
                    return true;
                } else {
                    if (supertype._supertype) {
                        return hasTemplateLayers(supertype._supertype);
                    }
                }
            }
            return false;
        }
        return (parent !== child) && !hasTemplateLayers(parent._supertype);
    }

    _isValidInternal(parent, child) {
        if (!child.isTemplate) {
            if ((parent.internalLyphs || []).find(e => e.id === child.id)) {
                return false;
            }
        }
        return parent !== child;
    }

    /**
     * Add subtype to a lyph template
     * @param node
     * @param index
     */
    insertSubtype(node, index) {
        let lyph = this.lyphToLink ? this.lyphToLink : this.defineNewLyph();
        let parent = this.entitiesByID[node.id] || this.selectedLyph;
        if (parent) {
            if (!this._isValidSubtype(parent, lyph)) {
                let message = "Cannot add a lyph as subtype to its a supertype!";
                this._snackBar.open(message, "OK", this._snackBarConfig);
            } else {
                parent.subtypes = parent.subtypes || [];
                parent.subtypes.push(lyph.id);
                parent.isTemplate = true;
                this.prepareLyphTree();
                this.updateView(parent, 'lyphTree');
                this.saveStep(`Add subtype ${lyph.id} to lyph ${parent.id}`);
            }
        } else {
            let message = "Cannot add subtype: no lyph is selected!";
            this._snackBar.open(message, "OK", this._snackBarConfig);
        }
    }

    /**
     * Add layer to the lyph
     * @param node
     * @param index
     */
    addLayer(node, index) {
        let lyph = this.lyphToLink ? this.lyphToLink : this.defineNewLyph();
        let parent = this.entitiesByID[node.id] || this.selectedLyph;
        if (parent) {
            if (parent._class === $SchemaClass.Lyph) {
                if (!this._isValidLayer(parent, lyph)) {
                    let message = "Cannot add a layer to this lyph: hierarchy or dependency conflict!";
                    this._snackBar.open(message, "OK", this._snackBarConfig);
                } else {
                    parent.layers = parent.layers || [];
                    parent.layers.push(lyph.id);
                    if (lyph !== this.lyphToLink) {
                        let node = this._createLyphNode(lyph);
                        this.lyphTree = [node, ...this.lyphTree];
                    }
                    this.prepareLayerTree();
                    if (parent._node && !parent._node.icons.includes(ICON.LAYERS)) {
                        parent._node.icons.push(ICON.LAYERS);
                    }
                    if (parent.internalLyphs) {
                        this.prepareInternalTree();
                    }
                    this.saveStep(`Add layer ${lyph.id} to lyph ${parent.id}`);
                }
            } else {
                let message = "Cannot add layer to a resource other than lyph!";
                this._snackBar.open(message, "OK", this._snackBarConfig);
            }
        } else {
            let message = "Cannot add layer: no lyph is selected!";
            this._snackBar.open(message, "OK", this._snackBarConfig);
        }
    }

    /**
     * Delete layer from the lyph
     * @param node
     * @param index
     */
    deleteLayer(node, index) {
        let parent = node.parent::isObject() ? node.parent : this.entitiesByID[node.parent];
        if (!parent) {
            this.deleteLyph(node);
        } else {
            if (index > -1 && parent.layers?.length > index) {
                parent.layers.splice(index, 1);
                let lyph = this.entitiesByID[node.id];
                if (lyph) {
                    delete lyph.layerIn;
                }
                if (parent.layers.length === 0) {
                    if (parent._node) {
                        parent._node.icons = parent._node.icons.filter(icon => icon !== ICON.LAYERS);
                    }
                }
            }
            this.prepareLayerTree();
            if (parent.internalLyphs) {
                this.prepareInternalTree();
            }
        }
    }

    moveLayerUp(node, index) {
        if (this.layerTree) {
            let parent = this.entitiesByID[this.layerTree[0].id];
            let tmp = parent.layers[index - 1];
            parent.layers[index - 1] = parent.layers[index];
            parent.layers[index] = tmp;
            this.prepareLayerTree();
            this.saveStep("Move up layer " + index + " of lyph " + parent.id);
        }
    }

    moveLayerDown(node, index) {
        if (this.layerTree) {
            let parent = this.entitiesByID[this.layerTree[0].id];
            let tmp = parent.layers[index + 1];
            parent.layers[index + 1] = parent.layers[index];
            parent.layers[index] = tmp;
            this.prepareLayerTree();
            this.saveStep("Move down layer " + index + " of lyph " + parent.id);
        }
    }

    /** History **/

    cleanHelpers() {
        this.entitiesByID::values().forEach(obj => {
            //Clean up all helper mods
            delete obj._class;
            delete obj._generated;
            delete obj._subtypes;
            delete obj._supertype;
            delete obj._node;
        });
    }

    saveChanges() {
        this.cleanHelpers();
        this.onChangesSave.emit(this._model);
    }

    preview() {
        let result = JSON.stringify(this._model, null, 4);
        const blob = new Blob([result], {type: 'text/plain'});
        FileSaver.saveAs(blob, this._model.id + '-material-editor.json');
    }

    /**
     * Save operation in history
     * @param action
     */
    saveStep(action) {
        if (this.currentStep > this.steps.length - 1) {
            this.currentStep = this.steps.length - 1;
        }
        if (this.currentStep !== this.steps.length - 1) {
            this.steps.length = this.currentStep + 1;
        }
        let snapshot = this._model::omit(['_supertype', '_subtypes'])::cloneDeep();
        this.steps.push({action: action, snapshot: snapshot, selected: this.selectedLyph, activeTree: this.activeTree});
        this.currentStep = this.steps.length - 1;
    }

    /**
     * Undo the operation
     */
    get canUndo() {
        return this.currentStep > 0;
    }

    get canRedo() {
        return this.currentStep < this.steps.length - 1;
    }

    get undoTitle() {
        return `Undo ${(this.canUndo ? '"' + this.steps[this.currentStep].action + '"' : "")}`;
    }

    get redoTitle() {
        return `Redo ${(this.canRedo ? '"' + this.steps[this.currentStep + 1].action + '"' : "")}`;
    }

    /**
     * Undo the operatio n
     */
    undo() {
        if (this.currentStep > 0 && this.currentStep < this.steps.length) {
            this.currentStep -= 1;
            this.lyphTree = [];
            let restoredStep = this.steps[this.currentStep];
            this._model = restoredStep.snapshot;
            this.prepareLyphTree();
            this.updateView(restoredStep.selected, restoredStep.activeTree);
        }
    }

    /**
     * Redo the operation
     */
    redo() {
        if (this.currentStep >= 0 && this.currentStep < this.steps.length - 1) {
            this.currentStep += 1;
            let restoredStep = this.steps[this.currentStep];
            this._model = restoredStep.snapshot;
            this.prepareLyphTree();
            this.updateView(restoredStep.selected, restoredStep.activeTree);
        }
    }
}

@NgModule({
    imports: [CommonModule, MatMenuModule, ResourceDeclarationModule, SearchAddBarModule, MatButtonModule,
        MatDividerModule, LyphTreeViewModule, LyphDeclarationModule],
    declarations: [LyphEditorComponent],
    exports: [LyphEditorComponent]
})
export class LyphEditorModule {
}
