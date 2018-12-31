import * as three from 'three';
export const THREE = window.THREE || three;
import {MaterialFactory} from './materialFactory';
import {merge} from 'lodash-bound';
import tinycolor from 'tinycolor2';

/**
 * Convert color string to hex
 * @param {string} str - string with color
 * @returns {number} - color hex
 */
export const colorStr2Hex = str => isNaN(str) ? parseInt(tinycolor(str).toHex(), 16) : str;

/**
 * Create lyph border shapes
 * @param {Array} params   - lyph border shape parameters
 * @returns {Array<Shape>} - ordered set of lyph border shapes: axial, 1st radial, outer, 2nd radial
 */
export function lyphBorders(params){
    let [width,  height,  radius,  top,  bottom] = params;
    let borders = [0,1,2,3].map(() => new THREE.Shape());

    //Axial border
    borders[0].moveTo( 0, - height / 2);
    borders[0].lineTo( 0,   height / 2);
    borders[1].moveTo( 0,   height / 2);
    //Top radial border
    if (top){
        borders[1].lineTo( width - radius, height / 2 );
        borders[2].moveTo( width - radius, height / 2 );
        borders[2].quadraticCurveTo( width,  height / 2, width,  height / 2 - radius);
    } else {
        borders[1].lineTo( width,  height / 2);
        borders[2].moveTo( width,  height / 2);
    }
    //Non-axial border
    if (bottom){
        borders[2].lineTo( width, - height / 2 + radius);
        borders[2].quadraticCurveTo( width, -height / 2, width - radius, -height / 2);
        borders[3].moveTo( width - radius, -height / 2);
    } else {
        borders[2].lineTo( width, -height / 2);
        borders[3].moveTo( width, -height / 2);
    }

    //Finish Bottom radial border
    borders[3].lineTo( 0, - height / 2);
    return borders;
}

/**
 * Create region border shapes
 * @param {Array<Vector2>} points - coordinates of region corner points
 * @returns {Array<Shape>}        - ordered set of region border shapes (sides of a polygon)
 */
export function polygonBorders(points){
    let borders = [];
    for (let i = 1; i < (points||[]).length; i++){
        let border = [points[i-1], points[i]].map(p => new THREE.Vector2(p.x, p.y));
        borders.push(new THREE.Shape(border)); //Expects Vector2!
    }
    return borders;
}

/**
 * Create lyph layer shape
 * @param {Array} inner - preceding (inner) lyph border shape parameters (@see lyphShape)
 * @param {Array} outer - current (outer) lyph border shape parameters
 * @returns {Shape}     - lyph layer shape (rectangle with or without rounded corners depending on its topology)
 */
export function layerShape(inner, outer) {
    const [$thickness, $height, $radius, $top, $bottom] = inner;
    const [thickness, height, radius, top, bottom] = outer;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    //draw top of the preceding layer geometry
    if ($thickness) {
        if ($top) {
            shape.lineTo(0, $height / 2 - $radius);
            shape.quadraticCurveTo(0, $height / 2, -$radius, $height / 2);
            shape.lineTo(-$thickness, $height / 2);
            shape.lineTo(-$thickness, height / 2);
        } else {
            shape.lineTo(0, height / 2);
        }
    }

    //top of the current layer
    shape.lineTo(0, height / 2);
    if (top) {
        shape.lineTo(thickness - radius, height / 2);
        shape.quadraticCurveTo(thickness, height / 2, thickness, height / 2 - radius);
    } else {
        shape.lineTo(thickness, height / 2);
    }

    //side and part of the bottom of the current layer
    if (bottom) {
        shape.lineTo(thickness, -height / 2 + radius);
        shape.quadraticCurveTo(thickness, -height / 2, thickness - radius, -height / 2);
    } else {
        shape.lineTo(thickness, -height / 2);
    }
    shape.lineTo(0, -height / 2);

    //draw bottom of the preceding layer geometry
    if ($thickness) {
        if ($bottom) {
            shape.lineTo(-$thickness, -height / 2);
            shape.lineTo(-$thickness, -$height / 2);
            shape.lineTo(-$radius, -$height / 2);
            shape.quadraticCurveTo(0, -$height / 2, 0, -$height / 2 + $radius);
        } else {
            shape.lineTo(0, -height / 2);
        }
    }
    shape.lineTo(0, 0);
    return shape;
}

/**
 * Create lyph shape
 * @param {Array} params - lyph border shape parameters (thickness and height, corner radius, and boolean values to mark radial border topology: "false" for open and "true" for closed)
 * @returns {Shape}      - lyph shape (rectangle with or without rounded corners depending on its topology)
 */
export function lyphShape(params) {
    let [thickness, height, radius, top, bottom] = params;

    const shape = new THREE.Shape();

    //Axial border
    shape.moveTo(0, -height / 2);
    shape.lineTo(0, height / 2);

    //Top radial border
    if (top) {
        shape.lineTo(thickness - radius, height / 2);
        shape.quadraticCurveTo(thickness, height / 2, thickness, height / 2 - radius);
    } else {
        shape.lineTo(thickness, height / 2);
    }

    //Non-axial border
    if (bottom) {
        shape.lineTo(thickness, -height / 2 + radius);
        shape.quadraticCurveTo(thickness, -height / 2, thickness - radius, -height / 2);
    } else {
        shape.lineTo(thickness, -height / 2);
    }

    //Finish Bottom radial border
    shape.lineTo(0, -height / 2);
    return shape;
}

/**
 * Create a 3d object with border
 * @param {Shape}  shape  - object shape
 * @param {Object} [params = {}] - object and border material params
 * @returns {Mesh}   3d object with child object that models its border
 */
export function createMeshWithBorder(shape, params = {}) {
    let geometry = new THREE.ShapeBufferGeometry(shape);
    let obj = new THREE.Mesh(geometry, MaterialFactory.createMeshBasicMaterial(params));

    // Create border
    let lineBorderGeometry = new THREE.Geometry();
    shape.getPoints().forEach(point => {
        point.z = 0;
        lineBorderGeometry.vertices.push(point);
    });
    let borderParams = params::merge({
        color   : tinycolor(params.color).darken(20), //20% darker color than surface
        opacity : 1,
        polygonOffsetFactor: params.polygonOffsetFactor - 1
    });
    let borderObj = new THREE.Line(lineBorderGeometry, MaterialFactory.createLineBasicMaterial(borderParams));
    obj.add(borderObj);
    return obj;
}

/**
 * Create a curve path resembling a semi-rectangle with rounded corners
 * @param {Vector3} startV                  - start coordinates
 * @param {Vector3} endV                    - end coordinates
 * @returns {CurvePath<Vector> | CurvePath} - curve path
 */
export function rectangleCurve(startV, endV){
    let edgeV   = endV.clone().sub(startV);
    let pEdgeV  = edgeV.clone().applyAxisAngle( new THREE.Vector3( 0, 0, 1 ), Math.PI / 2);

    let quarterX = edgeV.multiplyScalar(0.25);
    let quarter  = pEdgeV.clone().multiplyScalar(0.25);
    let half     = pEdgeV.clone().multiplyScalar(0.5);
    let p = [startV.clone(),
        startV.clone().add(quarter),
        startV.clone().add(half),
        startV.clone().add(half).add(quarterX),
        endV.clone().add(half).sub(quarterX),
        endV.clone().add(half),
        endV.clone().add(quarter),
        endV.clone()
    ];

    let curvePath = new THREE.CurvePath();
    curvePath.add(new THREE.LineCurve3(p[0], p[1]));
    curvePath.add(new THREE.QuadraticBezierCurve3(p[1], p[2], p[3]));
    curvePath.add(new THREE.LineCurve3(p[3], p[4]));
    curvePath.add(new THREE.QuadraticBezierCurve3(p[4], p[5], p[6]));
    curvePath.add(new THREE.LineCurve3(p[6], p[7]));

    return curvePath;
}

/**
 * Create a cubic Bezier curve resembling a semicircle
 * @param {Vector3} startV      - start coordinates
 * @param {Vector3} endV        - end coordinates
 * @returns {CubicBezierCurve3} - cubic Bezier curve
 */
export function bezierSemicircle(startV, endV){
    let edgeV   = endV.clone().sub(startV);
    let pEdgeV  = edgeV.clone().applyAxisAngle( new THREE.Vector3( 0, 0, 1 ), Math.PI / 2);
    let insetV  = edgeV.multiplyScalar(0.05);
    let offsetV = pEdgeV.multiplyScalar(2/3);

    return new THREE.CubicBezierCurve3(
        startV.clone(),
        startV.clone().add(insetV).add(offsetV),
        endV.clone().sub(insetV).add(offsetV),
        endV.clone());
}

/**
 * Create a vector from an object that contains coordinate fields x, y, and z
 * @param {Object} source - object with fields x, y, and z
 * @returns {Vector3}     - 3d vector
 */
export function extractCoords(source){
    if (!source) { return; }
    return new THREE.Vector3(source.x || 0, source.y || 0, source.z || 0);
}

/**
 * Align an object along its axis (link)
 * @param {{source: Vector3, target: Vector3}} link  - link between two points
 * @param {Object3D} obj                             - three.js visual object to align alone the line
 * @param {boolean} [reversed=false]  indicates whether the object should be aligned in reversed direction
 */
export function align(link, obj, reversed = false){
    if (!obj || !link) { return; }
    let axis = direction(link.source, link.target).normalize();
    if (reversed){ axis.multiplyScalar(-1); }
    obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
}

/**
 * Compute the angle between two 3d vectors
 * @param {Vector3} v1 first vector
 * @param {Vector3} v2 second vector
 * @returns {number} computed angle between the given vectors
 */
export function angle(v1, v2){
   let dot = v1.dot(v2);
   return Math.acos( dot / (v1.length() * v2.length()) );
}

/**
 * Create a vector between two 3d points
 * @param {Vector3} source  source coordinates
 * @param {Vector3} target  target coordinates
 * @returns {null}
 */
export function direction(source, target){
    if (!source || !target) { return new THREE.Vector3(0,0,0); }
    return (new THREE.Vector3(
        target.x - source.x,
        target.y - source.y,
        target.z - source.z
    ));
}

/**
 * Return the center of mass given a set of control points
 * @param {Array<Vector3>} points   control points
 * @returns {Vector3}               coordinates of the center of mass
 */
export function getCenterOfMass(points){
    let middle = new THREE.Vector3(0, 0, 0);
    (points||[]).forEach(p => {
        middle.x += p.x;
        middle.y += p.y;
        middle.z += p.z
    });
    middle = middle.multiplyScalar(1.0 / ((points||[]).length || 1));
    return middle;
}

/**
 * Find coordinates of the central point of the given mesh
 * @param {Mesh} mesh three.js mesh object
 * @returns {Vector3} coordinates of the mesh center
 */
export function getCenterPoint(mesh) {
    let boundingBox = getBoundingBox(mesh);
    let center = new THREE.Vector3();
    if (boundingBox) { boundingBox.getCenter(center); }
    mesh.localToWorld(center);
    return center;
}

/**
 * Get bounding box for a mesh geometry
 * @param {Mesh} mesh  triangular polygon mesh based object
 * @returns {Box3}     bounding box for the mesh geometry
 */
export function getBoundingBox(mesh) {
    if (!mesh.geometry){ return null; }
    if (!mesh.geometry.boundingBox) {
        mesh.geometry.computeBoundingBox();
    }
    return mesh.geometry.boundingBox;
}

/**
 * Pushes a point inside of a rectangle on a plane
 * @param {Vector2} point  point coordinates
 * @param {{x: number, y: number}} min    minimal coordinate values
 * @param {{x: number, y: number}} max    maximal coordinate values
 */
export function boundToRectangle(point, min, max){
    point.x = Math.max(Math.min(point.x, max.x) , min.x);
    point.y = Math.max(Math.min(point.y, max.y) , min.y);
}

/**
 * Force link ends to stay inside of a polygon (reset coordinates to the intersection point)
 * @param {{source: Vector2, target: Vector2}} link - link between two points
 * @param {Array} boundaryLinks                     - links representing sides of a polygon
 */
export function boundToPolygon(link, boundaryLinks){
    let sourceIn = pointInPolygon(link.source, boundaryLinks);
    let targetIn = pointInPolygon(link.target, boundaryLinks);
    if (!sourceIn || !targetIn) {
        let res = getBoundaryPoint(link, boundaryLinks);
        if (res){
            if (!sourceIn){
                //We first drag the source node to the rectangle,
                //The target node should be dragged to it by the link force
                link.source.x = res.x;
                link.source.y = res.y;
            }
            else {
                //If we place both source and target to the same point, they will repel
                //So we push the target node to the rectangle only after the source node is already there
                //I think it helps to reduce edge jumping, but optionally  we can remove the above 'else' statement
                if (!targetIn){
                    link.target.x = res.x;
                    link.target.y = res.y;
                }
            }
        }
    }
}

/**
 * Check whether the point is in a polygon
 * @param {{x: number, y: number}} point  point coordinates
 * @param {Array} boundaryLinks           links representing sides of a polygon
 * @returns {boolean}   returns true if the point is within the polygon boundaries
 */
function pointInPolygon (point, boundaryLinks) {
    let x = point.x, y = point.y, inside = false;
    boundaryLinks.forEach(line2 => {
        let xi = line2.source.x, yi = line2.source.y,
            xj = line2.target.x, yj = line2.target.y;
        let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) { inside = !inside; }
    });
    return inside;
}

/**
 * Find intersection of a line with polygon
 * @param {{source: Vector2, target: Vector2}} link    link between two points on a plane
 * @param {Array} boundaryLinks                        links representing sides of a polygon
 * @returns {null}
 */
function getBoundaryPoint (link, boundaryLinks){
    for (let i = 0; i < boundaryLinks.length; i++){
        let res = getLineIntersection(link, boundaryLinks[i]);
        if (res){ return res; }
    }
}

/**
 * Find intersection point of two lines
 * @param {{source: Vector2, target: Vector2}} line1  first line
 * @param {{source: Vector2, target: Vector2}} line2  second line
 * @returns {{x: number, y: number}}  coordinates of the intersection point or  null if the lines do not intersect
 */
function getLineIntersection(line1, line2) {
    let denominator, a, b, numerator1;//, numerator2;
    denominator = ((line2.target.y - line2.source.y) * (line1.target.x - line1.source.x)) - ((line2.target.x - line2.source.x) * (line1.target.y - line1.source.y));
    if (denominator === 0) { return }
    a = line1.source.y - line2.source.y;
    b = line1.source.x - line2.source.x;
    numerator1 = ((line2.target.x - line2.source.x) * a) - ((line2.target.y - line2.source.y) * b);
    a = numerator1 / denominator;
    //numerator2 = ((line1.target.x - line1.source.x) * a) - ((line1.target.y - line1.source.y) * b);
    //b = numerator2 / denominator;
    return {
        x: line1.source.x + (a * (line1.target.x - line1.source.x)),
        y: line1.source.y + (a * (line1.target.y - line1.source.y))
    };
}


