import * as three from 'three';
const THREE = window.THREE || three;
import { SpriteText2D } from 'three-text2d';
import { Model } from './model';
import { assign } from 'lodash-bound';
import { mergedGeometry, geometryDifference, align, direction, translate, copyCoords, getCenterPoint } from '../three/utils';
import { LinkModel, LINK_TYPES } from './linkModel';
import { BorderModel } from './borderModel';
import { modelClasses, boundToPolygon, boundToRectangle } from './utils';


/**
 * Class that creates visualization objects of lyphs
 */
export class LyphModel extends Model {
    //TODO there can be several axes for coalescing lyphs
    axis;
    layers;
    topology;
    border;

    constructor(id) {
        super(id);
        this.infoFields.text.push ('topology');
        this.infoFields.objects.push('axis');
        this.infoFields.lists.push('layers');
        //this.infoFields.lists.push('coalescences');
    }

    toJSON() {
        let res = super.toJSON();
        res.layers   = this.layers && this.layers.forEach(layer => layer.id);
        res.axis     = this.axis && this.axis.id;
        res.topology = this.topology;
        res.border   = this.border.toJSON();
        return res;
    }

    static fromJSON(json, modelClasses = {}) {
        json.class = json.class || "Lyph";
        const result = super.fromJSON(json, modelClasses);
        result::assign(json); //TODO pick only valid properties

        //Create lyph's border
        result.border             = result.border || {};
        result.border.id          = result.border.id || "b_" + result.id; //derive border id from lyph's id
        result.border.borderTypes = result.border.borderTypes || [false,...this.radialBorderTypes(result.topology), false];
        result.border             = BorderModel.fromJSON(result.border, modelClasses);
        return result;
    }

    static radialBorderTypes(topology){
        switch (topology) {
            case "BAG"  : return [true,  false];
            case "BAG2" : return [false, true];
            case "CYST" : return [true,  true];
        }
        return [false, false];
    }

    //lyph's center = the center of its rotational axis
    get center(){
        let res = new THREE.Vector3();
        if (this.axis) {
            res = this.axis.center;
            //layers have the same axis at their host lyph
            if (this.layerInLyph) { translate(res, this.offset, this.axis); }
        }
        return res;
    }

    get polygonOffsetFactor(){
        let res = 0;
        if (this.container)    { res = this.container.polygonOffsetFactor - 1; }
        if (this.layerInLyph)  { res = Math.min(res, this.layerInLyph.polygonOffsetFactor - 1); }
        if (this.externalLyph) { res = Math.min(res, this.externalLyph.polygonOffsetFactor - 1); }
        return res;
    }

    /**
     * Create view model for the class instance
     * @param state - layout settings
     */
    createViewObjects(state){

        /**
         * Draws layer of a lyph in 3d. Closed borders are drawn as cylinders because sphere approximation is quite slow
         * @param inner = [$thickness, $height, $radius, $top, $bottom], where:
         * $thickness is axial border distance from the rotational axis
         * $height is axial border height
         * $radius is the radius for the circle for closed border
         * $top is a boolean value indicating whether top axial border is closed
         * $bottom is a boolean value indicating whether bottom axial border is closed
         * @param outer = [thickness,  height,  radius,  top,  bottom], where
         * thickness is non-axial border distance from the rotational axis
         * height is non-axial border height
         * radius is the radius for the circle for closed border
         * top is a boolean value indicating whether top non-axial border is closed
         * bottom is a boolean value indicating whether bottom non-axial border is closed
         * @param material - object material
         * @returns {THREE.Mesh} - a mesh representing layer (tube, bag or cyst)
         * @example
         * d3Layer([ layer.width * i + 1,       layer.height, layer.width / 2, ...layer.border.radialTypes],
         *         [ layer.width * (i + 1) + 1, layer.height, layer.width / 2, ...layer.border.radialTypes], layer.material);
         */
        function d3Layer(inner, outer, material){
            const [$thickness, $height, $radius, $top, $bottom] = inner;
            const [ thickness,  height,  radius,  top,  bottom] = outer;
            const a = 0.5;
            const b = 0.5 * (1 - a) ;
            //Cylinder constructor parameters: [radiusAtTop, radiusAtBottom, height, segmentsAroundRadius, segmentsAlongHeight]
            //Closed borders are approximated by cylinders with smaller diameters for speed

            let $tube      = new THREE.CylinderGeometry( $thickness, $thickness, a * $height, 10, 4);
            let $cupTop    = new THREE.CylinderGeometry( $top? $thickness - $radius: $thickness, $thickness, b * $height, 10, 4);
            let $cupBottom = new THREE.CylinderGeometry( $thickness, $bottom? $thickness - $radius: $thickness, b * $height, 10, 4);

            let tube       = new THREE.CylinderGeometry( thickness,  thickness,  a * height, 10, 4);
            let cupTop     = new THREE.CylinderGeometry( top? thickness - radius: thickness,  thickness,  b * height, 10, 4);
            let cupBottom  = new THREE.CylinderGeometry( thickness, bottom? thickness - radius: thickness,  b * height, 10, 4);

            let smallGeometry = mergedGeometry($tube, $cupTop, $cupBottom, (a + b) * 0.5 * $height);
            let largeGeometry = mergedGeometry(tube,   cupTop,  cupBottom, (a + b) * 0.5 * height);

            return geometryDifference(smallGeometry, largeGeometry, material);
        }

        /**
         * Draws layer of a lyph in 2d.
         * @param inner = [$thickness, $height, $radius, $top, $bottom], where:
         * $thickness is axial border distance from the rotational axis
         * $height is axial border height
         * $radius is the radius for the circle for closed border
         * $top is a boolean value indicating whether top axial border is closed
         * $bottom is a boolean value indicating whether bottom axial border is closed
         * @param outer = [thickness,  height,  radius,  top,  bottom], where
         * thickness is non-axial border distance from the rotational axis
         * height is non-axial border height
         * radius is the radius for the circle for closed border
         * top is a boolean value indicating whether top non-axial border is closed
         * bottom is a boolean value indicating whether bottom non-axial border is closed
         * @param material - object material
         * @returns {THREE.Mesh} - a mesh representing layer (tube, bag or cyst)
         */
        function d2Layer(inner, outer, material){
            const [$thickness, $height, $radius, $top, $bottom] = inner;
            const [ thickness,  height,  radius,  top,  bottom] = outer;
            const shape = new THREE.Shape();
            shape.moveTo( 0, 0);
            //draw top of the preceding layer geometry
            if ($thickness) {
                if ($top){
                    shape.lineTo( 0, $height / 2 - $radius);
                    shape.quadraticCurveTo( 0, $height / 2, -$radius,  $height / 2);
                    shape.lineTo( -$thickness, $height / 2);
                    shape.lineTo( -$thickness, height / 2);
                } else {
                    shape.lineTo( 0, height / 2);
                }
            }

            //top of the current layer
            shape.lineTo( 0, height / 2);
            if (top){
                shape.lineTo( thickness - radius, height / 2);
                shape.quadraticCurveTo( thickness,  height / 2, thickness,  height / 2 - radius);
            } else {
                shape.lineTo( thickness,  height / 2);
            }

            //side and part of the bottom of the current layer
            if (bottom){
                shape.lineTo( thickness, -height / 2 + radius);
                shape.quadraticCurveTo( thickness, -height / 2, thickness - radius, -height / 2);
            } else {
                shape.lineTo( thickness, -height / 2);
            }
            shape.lineTo( 0, - height/2);

            //draw bottom of the preceding layer geometry
            if ($thickness){
                if ($bottom){
                    shape.lineTo(-$thickness, -height / 2);
                    shape.lineTo(-$thickness, -$height / 2);
                    shape.lineTo( -$radius, -$height / 2);
                    shape.quadraticCurveTo( 0, -$height / 2, 0,  -$height / 2 + $radius);
                } else {
                    shape.lineTo( 0, -height / 2);
                }
            }
            shape.lineTo( 0, 0);
            let layerGeometry = new THREE.ShapeBufferGeometry(shape);

            return new THREE.Mesh( layerGeometry, material );
        }

        /**
         * Draw lyph shape without repeating the shape of the previous layer
         * @param outer = [thickness,  height,  radius,  top,  bottom], where
         * thickness is non-axial border distance from the rotational axis
         * height is non-axial border height
         * radius is the radius for the circle for closed border
         * top is a boolean value indicating whether top non-axial border is closed
         * bottom is a boolean value indicating whether bottom non-axial border is closed
         * @param material - object material
         * @returns {THREE.Mesh} - a mesh representing layer (tube, bag or cyst)
         */
        function d2Lyph(outer, material){
            let [thickness,  height,  radius,  top,  bottom] = outer;

            const shape = new THREE.Shape();

            //Axial border
            shape.moveTo( 0, - height / 2);
            shape.lineTo( 0,   height / 2);

            //Top radial border
            if (top){
                shape.lineTo( thickness - radius, height / 2);
                shape.quadraticCurveTo( thickness,  height / 2, thickness,  height / 2 - radius);
            } else {
                shape.lineTo( thickness,  height / 2);
            }

            //Non-axial border
            if (bottom){
                shape.lineTo( thickness, - height / 2 + radius);
                shape.quadraticCurveTo( thickness, -height / 2, thickness - radius, -height / 2);
            } else {
                shape.lineTo( thickness, - height / 2);
            }

            //Finish Bottom radial border
            shape.lineTo( 0, - height / 2);

            let lyphGeometry = new THREE.ShapeBufferGeometry(shape);

            return new THREE.Mesh( lyphGeometry, material); //Problem: we cannot get the lyph shape anymore
        }

        //Cannot draw a lyph without axis
        if (!this.axis) { return; }

        //Either use given dimensions or set from axis
        this.width  = this.width  || this.axis.lyphSize.width;
        this.height = this.height || this.axis.lyphSize.height;

        //There may be several objects representing a lyph, i.e., "2d" and "3d"
        this.viewObjects["lyphs"] = this.viewObjects["lyphs"] || {};

        //Create a lyph object corresponding to the view option defined by the state.method
        if (!this.viewObjects["lyphs"][state.method]){
            let numLayers = (this.layers || [this]).length;
            if (!this.material) {
                this.material = state.materialRepo.createMeshBasicMaterial({
                    color: this.color,
                    polygonOffsetFactor: this.polygonOffsetFactor
                });
            }

            //Base width of one layer
            let thickness = this.width / numLayers;
            //The shape of the lyph depends on its position in its parent lyph as layer
            let lyphObj = this.prev? d2Layer(
                    [ this.width, this.height, thickness / 2, ...this.border.radialTypes],
                    [ this.prev.width, this.prev.height, thickness / 2, ...this.prev.border.radialTypes],
                    this.material)
                : d2Lyph([this.width, this.height, thickness / 2, ...this.border.radialTypes], this.material);

            lyphObj.__data = this;
            this.viewObjects["lyphs"][state.method] = lyphObj;

            this.border.borderInLyph  = this;
            this.border.createViewObjects(state);

            //Layers
            (this.layers || []).forEach((layer, i) => {
                //TODO think if we need to clone axis for layer
                layer.axis = this.axis;
                layer.width  = thickness;
                layer.height = this.height;
                layer.layerInLyph = this;
                layer.offset = thickness * i;
                if (i > 0) {
                    layer.prev      = this.layers[i - 1];
                    layer.prev.next = this.layers[i];
                }

                layer.createViewObjects(state);
                let layerObj = layer.viewObjects["main"];
                layerObj.translateX(thickness * i);
                layerObj.translateZ(1);

                //Draw nested lyphs
                //TODO assign content to border and process in borderModel
                // if (layer.content){
                //     //TODO rewrite to derive rotational axis from data
                //     let borderObjects  = layer.border.viewObjects["shape"];
                //     if (borderObjects[3]){
                //         //be default, content lyphs rotate around border #3, i.e., layer.borderObjects[3]
                //         let source = borderObjects[3].getPoint(0);
                //         let target = borderObjects[3].getPoint(1);
                //
                //         //TODO create a border class and make it a rotational axis
                //         let contentLyphAxis = LinkModel.fromJSON({
                //             source: source,
                //             target: target,
                //             linkInLyph: this,
                //             center: (source.clone().add(target)).multiplyScalar(0.5)
                //         }, modelClasses);
                //         layer.content.axis = contentLyphAxis;
                //         //'content' and 'container' are the opposites for the "Contains" relationship
                //         //TODO create a uniform mechanism to check at construction that both entities in a relationship refer each other
                //         layer.content.container = layer;
                //         layer.content.createViewObjects(state);
                //
                //         //TODO assign layer its own axis which is a parallel line to the link
                //         layer.layerInLyph = this;
                //         layer.offset = new THREE.Vector3(thickness * i, 0, 0);
                //         const contentLyph = layer.content.viewObjects["lyphs"][state.method];
                //         layerObj.add(contentLyph);
                //     }
                // }
                lyphObj.add(layerObj);
            });
        }
        this.viewObjects['main']  = this.viewObjects["lyphs"][state.method];

        //Do not create labels for lyphs
        if (this.layerInLyph || this.externalLyph){ return; }

        //Labels
        this.labels = this.labels || {};
        if (!this.labels[state.iconLabel] && this[state.iconLabel]){
            this.labels[state.iconLabel] = new SpriteText2D(this[state.iconLabel], state.fontParams);
        }
        if (this.labels[state.iconLabel]) {
            this.viewObjects['label'] = this.labels[state.iconLabel];
        } else {
            delete this.viewObjects['label'];
        }
    }

    updateViewObjects(state){
        if (!this.axis) {return; }
        if (!this.viewObjects["lyphs"][state.method]){
            this.createViewObjects(state);
        }
        this.viewObjects['main']  = this.viewObjects["lyphs"][state.method];

        let skip = this.layerInLyph || this.externalLyph;

        if (!skip) {//update label
            if (!(this.labels[state.iconLabel] && this[state.iconLabel])) {
                this.createViewObjects(state);
            }
        }
        if (!this.layerInLyph){
            //update lyph
            this.viewObjects["main"].visible = state.showLyphs;
            copyCoords(this.viewObjects["main"].position, this.center);
            align(this.axis, this.viewObjects["main"]);
        }

        //update border
        this.border.updateViewObjects(state);

        //update layers
        (this.layers || []).forEach(layer => { layer.updateViewObjects(state); });

        //update inner content
        if (this.internalLyphs){
            const fociCenter = getCenterPoint(this.viewObjects["main"]);
            //const fociCenter = this.center;
            //const fociCenter = new THREE.Vector3().setFromMatrixPosition( this.viewObjects["main"].matrixWorld );
            state.graphData.links
                .filter(link =>  link.conveyingLyph && this.internalLyphs.includes(link.conveyingLyph.id))
                .forEach(link => {
                    // copyCoords(link.source.layout, fociCenter);
                    // copyCoords(link.target.layout, fociCenter);

                    //If we need to clean these layout constraints, set some flag
                    // link.source.layout.reason = "container";
                    // link.target.layout.reason = "container";

                    //Roughly confine the links to avoid extreme link jumping
                    //Regardless of the rotation, the area is bounded to the center +/- hypotenuse / 2
                    let h = Math.sqrt(this.width*this.width + this.height * this.height) / 2;
                    boundToRectangle(link.source, fociCenter, h, h);
                    boundToRectangle(link.target, fociCenter, h, h);

                    //Push the link to the tilted lyph rectangle
                    boundToPolygon({source: link.source, target: link.target}, this.border.borderLinks);

                    //Project links with innerLyphs to the container lyph plane
                    let plane = new THREE.Plane();
                    let _start = new THREE.Vector3(this.axis.source.x, this.axis.source.y, this.axis.source.z || 0);
                    let _end = new THREE.Vector3(this.axis.target.x, this.axis.target.y, this.axis.target.z || 0);
                    plane.setFromCoplanarPoints(_start, _end, fociCenter);

                    let _linkStart = new THREE.Vector3(link.source.x, link.source.y, link.source.z || 0);
                    let _linkEnd = new THREE.Vector3(link.target.x, link.target.y, link.target.z || 0);

                    _linkStart  = plane.projectPoint ( _linkStart);
                    _linkEnd = plane.projectPoint ( _linkEnd );
                    _linkStart.z += 1;
                    _linkEnd.z += 1;

                    copyCoords(link.source, _linkStart);
                    copyCoords(link.target, _linkEnd);
                });
        }

        (this.viewObjects['main'].children || []).forEach(child => {child.visible = state.showLayers;});

        //Layers and inner lyphs have no labels
        if (!skip) {
            if (this.labels[state.iconLabel]){
                this.viewObjects['label'] = this.labels[state.iconLabel];
                this.viewObjects['label'].visible = state.showLyphLabel;
                copyCoords(this.viewObjects['label'].position, this.center);
                this.viewObjects['label'].position.addScalar(-5);
            } else {
                delete this.viewObjects['label'];
            }
        }
    }
}
