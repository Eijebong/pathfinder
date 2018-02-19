// pathfinder/client/src/mesh-debugger.ts
//
// Copyright © 2018 The Pathfinder Project Developers.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

import * as glmatrix from 'gl-matrix';
import * as opentype from "opentype.js";

import {Font} from 'opentype.js';
import {AppController} from "./app-controller";
import {OrthographicCamera} from "./camera";
import {FilePickerView} from './file-picker';
import {B_QUAD_UPPER_RIGHT_VERTEX_OFFSET} from "./meshes";
import {B_QUAD_LOWER_LEFT_VERTEX_OFFSET, B_QUAD_UPPER_CONTROL_POINT_VERTEX_OFFSET} from "./meshes";
import {B_QUAD_LOWER_RIGHT_VERTEX_OFFSET} from "./meshes";
import {B_QUAD_LOWER_CONTROL_POINT_VERTEX_OFFSET, PathfinderMeshData} from "./meshes";
import {B_QUAD_SIZE, B_QUAD_UPPER_LEFT_VERTEX_OFFSET} from "./meshes";
import {BUILTIN_SVG_URI, SVGLoader} from './svg-loader';
import {BUILTIN_FONT_URI, TextRun} from "./text";
import {GlyphStore, PathfinderFont, TextFrame} from "./text";
import {assert, UINT32_MAX, UINT32_SIZE, unwrapNull} from "./utils";
import {PathfinderView} from "./view";

const CHARACTER: string = 'A';

const FONT: string = 'eb-garamond';

const POINT_LABEL_FONT: string = "sans-serif";
const POINT_LABEL_FONT_SIZE: number = 12.0;
const POINT_LABEL_OFFSET: glmatrix.vec2 = glmatrix.vec2.fromValues(12.0, 12.0);
const POINT_RADIUS: number = 2.0;

const SEGMENT_POINT_RADIUS: number = 3.0;
const SEGMENT_STROKE_WIDTH: number = 1.0;
const SEGMENT_CONTROL_POINT_STROKE_WIDTH: number = 1.0;

const NORMAL_LENGTHS: NormalStyleParameter<number> = {
    bVertex: 10.0,
    edge: 14.0,
};

const NORMAL_ARROWHEAD_LENGTH: number = 4.0;
const NORMAL_ARROWHEAD_ANGLE: number = Math.PI * 5.0 / 6.0;

const SEGMENT_POINT_FILL_STYLE: string = "rgb(0, 0, 128)";

const LIGHT_STROKE_STYLE: string = "rgb(192, 192, 192)";
const LINE_STROKE_STYLE: string = "rgb(0, 128, 0)";
const CURVE_STROKE_STYLE: string = "rgb(128, 0, 0)";
const SEGMENT_LINE_STROKE_STYLE: string = "rgb(128, 192, 128)";
const SEGMENT_CONTROL_POINT_FILL_STYLE: string = "rgb(255, 255, 255)";
const SEGMENT_CONTROL_POINT_STROKE_STYLE: string = "rgb(0, 0, 128)";
const SEGMENT_CONTROL_POINT_HULL_STROKE_STYLE: string = "rgba(128, 128, 128, 0.5)";

const NORMAL_STROKE_STYLES: NormalStyleParameter<string> = {
    bVertex: '#e6aa00',
    edge: '#cc5500',
};

const BUILTIN_URIS = {
    font: BUILTIN_FONT_URI,
    svg: BUILTIN_SVG_URI,
};

const SVG_SCALE: number = 1.0;

type FileType = 'font' | 'svg';

type NormalType = 'edge' | 'bVertex';

interface NormalStyleParameter<T> {
    edge: T;
    bVertex: T;
}

interface NormalsTable<T> {
    lowerCurve: T;
    lowerLine: T;
    upperCurve: T;
    upperLine: T;
}

class MeshDebuggerAppController extends AppController {
    meshes: PathfinderMeshData | null = null;

    protected readonly defaultFile: string = FONT;

    private file: PathfinderFont | SVGLoader | null = null;
    private fileType!: FileType;
    private fileData: ArrayBuffer | null = null;

    private openModal!: HTMLElement;
    private openFileSelect!: HTMLSelectElement;
    private fontPathSelectGroup!: HTMLElement;
    private fontPathSelect!: HTMLSelectElement;

    private filePicker!: FilePickerView;
    private view!: MeshDebuggerView;

    start() {
        super.start();

        this.fileType = 'font';

        this.view = new MeshDebuggerView(this);

        this.filePicker = unwrapNull(FilePickerView.create());
        this.filePicker.onFileLoaded = fileData => this.fileLoaded(fileData, null);

        this.openModal = unwrapNull(document.getElementById('pf-open-modal'));
        this.fontPathSelectGroup =
            unwrapNull(document.getElementById('pf-font-path-select-group'));
        this.fontPathSelect = unwrapNull(document.getElementById('pf-font-path-select')) as
            HTMLSelectElement;

        this.openFileSelect = unwrapNull(document.getElementById('pf-open-file-select')) as
            HTMLSelectElement;
        this.openFileSelect.addEventListener('click', () => this.openSelectedFile(), false);

        const openButton = unwrapNull(document.getElementById('pf-open-button'));
        openButton.addEventListener('click', () => this.showOpenDialog(), false);

        const openOKButton = unwrapNull(document.getElementById('pf-open-ok-button'));
        openOKButton.addEventListener('click', () => this.loadPath(), false);

        this.loadInitialFile(BUILTIN_FONT_URI);
    }

    protected fileLoaded(fileData: ArrayBuffer, builtinName: string | null): void {
        while (this.fontPathSelect.lastChild != null)
            this.fontPathSelect.removeChild(this.fontPathSelect.lastChild);

        this.fontPathSelectGroup.classList.remove('pf-display-none');

        if (this.fileType === 'font')
            this.fontLoaded(fileData, builtinName);
        else if (this.fileType === 'svg')
            this.svgLoaded(fileData);
    }

    protected loadPath(opentypeGlyph?: opentype.Glyph | null) {
        window.jQuery(this.openModal).modal('hide');

        let promise: Promise<PathfinderMeshData>;

        if (this.file instanceof PathfinderFont && this.fileData != null) {
            if (opentypeGlyph == null) {
                const glyphIndex = parseInt(this.fontPathSelect.selectedOptions[0].value, 10);
                opentypeGlyph = this.file.opentypeFont.glyphs.get(glyphIndex);
            }

            const glyphStorage = new GlyphStore(this.file, [(opentypeGlyph as any).index]);
            promise = glyphStorage.partition().then(result => result.meshes);
        } else if (this.file instanceof SVGLoader) {
            promise = this.file.partition(this.fontPathSelect.selectedIndex);
        } else {
            return;
        }

        promise.then(meshes => {
            this.meshes = meshes;
            this.view.attachMeshes();
        });
    }

    private showOpenDialog(): void {
        window.jQuery(this.openModal).modal();
    }

    private openSelectedFile(): void {
        const selectedOption = this.openFileSelect.selectedOptions[0] as HTMLOptionElement;
        const optionValue = selectedOption.value;

        this.fontPathSelectGroup.classList.add('pf-display-none');

        const results = unwrapNull(/^([a-z]+)-(.*)$/.exec(optionValue));
        this.fileType = results[1] as FileType;

        const filename = results[2];
        if (filename === 'custom')
            this.filePicker.open();
        else
            this.fetchFile(results[2], BUILTIN_URIS[this.fileType]);
    }

    private fontLoaded(fileData: ArrayBuffer, builtinName: string | null): void {
        this.file = new PathfinderFont(fileData, builtinName);
        this.fileData = fileData;

        const glyphCount = this.file.opentypeFont.numGlyphs;
        for (let glyphIndex = 1; glyphIndex < glyphCount; glyphIndex++) {
            const newOption = document.createElement('option');
            newOption.value = "" + glyphIndex;
            const glyphName = this.file.opentypeFont.glyphIndexToName(glyphIndex);
            newOption.appendChild(document.createTextNode(glyphName));
            this.fontPathSelect.appendChild(newOption);
        }

        // Automatically load a path if this is the initial pageload.
        if (this.meshes == null)
            this.loadPath(this.file.opentypeFont.charToGlyph(CHARACTER));
    }

    private svgLoaded(fileData: ArrayBuffer): void {
        this.file = new SVGLoader;
        this.file.scale = SVG_SCALE;
        this.file.loadFile(fileData);

        const pathCount = this.file.pathInstances.length;
        for (let pathIndex = 0; pathIndex < pathCount; pathIndex++) {
            const newOption = document.createElement('option');
            newOption.value = "" + pathIndex;
            newOption.appendChild(document.createTextNode(`Path ${pathIndex}`));
            this.fontPathSelect.appendChild(newOption);
        }
    }
}

class MeshDebuggerView extends PathfinderView {
    camera: OrthographicCamera;

    private appController: MeshDebuggerAppController;

    private drawControl: boolean = true;
    private drawNormals: boolean = true;
    private drawVertices: boolean = true;
    private drawSegments: boolean = false;

    constructor(appController: MeshDebuggerAppController) {
        super();

        this.appController = appController;
        this.camera = new OrthographicCamera(this.canvas, { ignoreBounds: true });

        this.camera.onPan = () => this.setDirty();
        this.camera.onZoom = () => this.setDirty();

        window.addEventListener('keypress', event => this.onKeyPress(event), false);

        this.resizeToFit(true);
    }

    attachMeshes() {
        this.setDirty();
    }

    redraw() {
        super.redraw();

        const meshes = this.appController.meshes;
        if (meshes == null)
            return;

        const context = unwrapNull(this.canvas.getContext('2d'));
        context.clearRect(0, 0, this.canvas.width, this.canvas.height);

        context.save();
        context.translate(this.camera.translation[0],
                          this.canvas.height - this.camera.translation[1]);
        context.scale(this.camera.scale, this.camera.scale);

        const invScaleFactor = window.devicePixelRatio / this.camera.scale;
        context.font = `12px ${POINT_LABEL_FONT}`;
        context.lineWidth = invScaleFactor;

        const bQuadVertexPositions = new Float32Array(meshes.bQuadVertexPositions);

        const normals: NormalsTable<Float32Array> = {
            lowerCurve: new Float32Array(0),
            lowerLine: new Float32Array(0),
            upperCurve: new Float32Array(0),
            upperLine: new Float32Array(0),
        };

        // Draw B-quads.
        for (let bQuadIndex = 0; bQuadIndex < meshes.bQuadVertexPositionCount; bQuadIndex++) {
            const bQuadStartOffset = (B_QUAD_SIZE * bQuadIndex) / UINT32_SIZE;

            const upperLeftPosition = getPosition(bQuadVertexPositions, bQuadIndex, 0);
            const upperControlPointPosition = getPosition(bQuadVertexPositions, bQuadIndex, 1);
            const upperRightPosition = getPosition(bQuadVertexPositions, bQuadIndex, 2);
            const lowerRightPosition = getPosition(bQuadVertexPositions, bQuadIndex, 3);
            const lowerControlPointPosition = getPosition(bQuadVertexPositions, bQuadIndex, 4);
            const lowerLeftPosition = getPosition(bQuadVertexPositions, bQuadIndex, 5);

            if (this.drawVertices) {
                drawVertexIfNecessary(context, upperLeftPosition, invScaleFactor);
                drawVertexIfNecessary(context, upperRightPosition, invScaleFactor);
                drawVertexIfNecessary(context, lowerLeftPosition, invScaleFactor);
                drawVertexIfNecessary(context, lowerRightPosition, invScaleFactor);
            }

            context.beginPath();
            context.moveTo(upperLeftPosition[0], -upperLeftPosition[1]);
            if (upperControlPointPosition != null) {
                context.strokeStyle = CURVE_STROKE_STYLE;
                context.quadraticCurveTo(upperControlPointPosition[0],
                                         -upperControlPointPosition[1],
                                         upperRightPosition[0],
                                         -upperRightPosition[1]);
            } else {
                context.strokeStyle = LINE_STROKE_STYLE;
                context.lineTo(upperRightPosition[0], -upperRightPosition[1]);
            }
            context.stroke();

            context.strokeStyle = LIGHT_STROKE_STYLE;
            context.beginPath();
            context.moveTo(upperRightPosition[0], -upperRightPosition[1]);
            context.lineTo(lowerRightPosition[0], -lowerRightPosition[1]);
            context.stroke();

            context.beginPath();
            context.moveTo(lowerRightPosition[0], -lowerRightPosition[1]);
            if (lowerControlPointPosition != null) {
                context.strokeStyle = CURVE_STROKE_STYLE;
                context.quadraticCurveTo(lowerControlPointPosition[0],
                                         -lowerControlPointPosition[1],
                                         lowerLeftPosition[0],
                                         -lowerLeftPosition[1]);
            } else {
                context.strokeStyle = LINE_STROKE_STYLE;
                context.lineTo(lowerLeftPosition[0], -lowerLeftPosition[1]);
            }
            context.stroke();

            context.strokeStyle = LIGHT_STROKE_STYLE;
            context.beginPath();
            context.moveTo(lowerLeftPosition[0], -lowerLeftPosition[1]);
            context.lineTo(upperLeftPosition[0], -upperLeftPosition[1]);
            context.stroke();
        }

        // Draw segments.
        if (this.drawVertices) {
            drawSegmentVertices(context,
                                new Float32Array(meshes.stencilSegments),
                                new Float32Array(meshes.stencilNormals),
                                meshes.stencilSegmentCount,
                                [0, 2],
                                1,
                                3,
                                invScaleFactor,
                                this.drawControl,
                                this.drawNormals,
                                this.drawSegments);
        }
        context.restore();
    }

    private onKeyPress(event: KeyboardEvent): void {
        if (event.key === "c") {
            this.drawControl = !this.drawControl;
        } else if (event.key === "n") {
            this.drawNormals = !this.drawNormals;
        } else if (event.key === "v") {
            this.drawVertices = !this.drawVertices;
        } else if (event.key === "r") {
            // Reset
            this.drawControl = true;
            this.drawNormals = true;
            this.drawVertices = true;
        }
        this.setDirty();
    }
}

function getPosition(positions: Float32Array, bQuadIndex: number, vertexIndex: number):
                     glmatrix.vec2 {
    return glmatrix.vec2.clone([
        positions[(bQuadIndex * 6 + vertexIndex) * 2 + 0],
        positions[(bQuadIndex * 6 + vertexIndex) * 2 + 1],
    ]);
}

function getNormal(normals: Float32Array, bQuadIndex: number, vertexIndex: number): number {
    return normals[bQuadIndex * 6 + vertexIndex];
}

function getNormals(normals: NormalsTable<Float32Array>,
                    normalIndices: NormalsTable<number>,
                    isCurve: boolean,
                    side: 'upper' | 'lower'):
                    { left: number, right: number } {
    const key: keyof NormalsTable<void> = (side + (isCurve ? 'Curve' : 'Line')) as keyof
        NormalsTable<void>;
    const startOffset = normalIndices[key];
    normalIndices[key]++;
    return {
        left: normals[key][startOffset * 2 + 0],
        right: normals[key][startOffset * 2 + 1],
    };
}

function drawSegmentVertices(context: CanvasRenderingContext2D,
                             segments: Float32Array,
                             normals: Float32Array,
                             segmentCount: number,
                             endpointOffsets: number[],
                             controlPointOffset: number | null,
                             segmentSize: number,
                             invScaleFactor: number,
                             drawControl: boolean,
                             drawNormals: boolean,
                             drawSegments: boolean) {
    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex++) {
        const positionStartOffset = segmentSize * 2 * segmentIndex;
        const normalStartOffset = segmentSize * 2 * segmentIndex;

        const position0 =
            glmatrix.vec2.clone([segments[positionStartOffset + endpointOffsets[0] * 2 + 0],
                                 segments[positionStartOffset + endpointOffsets[0] * 2 + 1]]);
        const position1 =
            glmatrix.vec2.clone([segments[positionStartOffset + endpointOffsets[1] * 2 + 0],
                                 segments[positionStartOffset + endpointOffsets[1] * 2 + 1]]);

        let controlPoint: glmatrix.vec2 | null;
        if (controlPointOffset != null) {
            controlPoint =
                glmatrix.vec2.clone([segments[positionStartOffset + controlPointOffset * 2 + 0],
                                     segments[positionStartOffset + controlPointOffset * 2 + 1]]);
        } else {
            controlPoint = null;
        }

        const normal0 =
            glmatrix.vec2.clone([normals[normalStartOffset + endpointOffsets[0] * 2 + 0],
                                 normals[normalStartOffset + endpointOffsets[0] * 2 + 1]]);
        const normal1 =
            glmatrix.vec2.clone([normals[normalStartOffset + endpointOffsets[1] * 2 + 0],
                                 normals[normalStartOffset + endpointOffsets[1] * 2 + 1]]);

        let normalControlPoint: glmatrix.vec2 | null;
        if (controlPointOffset != null) {
            normalControlPoint =
                glmatrix.vec2.clone([normals[normalStartOffset + controlPointOffset * 2 + 0],
                                     normals[normalStartOffset + controlPointOffset * 2 + 1]]);
        } else {
            normalControlPoint = null;
        }

        if (drawNormals) {
            drawNormal(context, position0, normal0, invScaleFactor, 'edge');
            drawNormal(context, position1, normal1, invScaleFactor, 'edge');
            if (drawControl && controlPoint != null && normalControlPoint != null)
                drawNormal(context, controlPoint, normalControlPoint, invScaleFactor, 'edge');
        }

        drawSegmentVertex(context, position0, invScaleFactor);
        drawSegmentVertex(context, position1, invScaleFactor);
        if (drawControl && controlPoint != null) {
            context.save();
            context.strokeStyle = SEGMENT_CONTROL_POINT_HULL_STROKE_STYLE;
            context.setLineDash([2 * invScaleFactor, 2 * invScaleFactor]);
            context.beginPath();
            context.moveTo(position0[0], -position0[1]);
            context.lineTo(controlPoint[0], -controlPoint[1]);
            context.lineTo(position1[0], -position1[1]);
            context.stroke();
            context.restore();
            drawSegmentControlPoint(context, controlPoint, invScaleFactor);
        }

        // TODO(pcwalton): Draw the curves too.
        if (drawSegments) {
            context.save();
            context.strokeStyle = SEGMENT_LINE_STROKE_STYLE;
            context.beginPath();
            context.moveTo(position0[0], -position0[1]);
            context.lineTo(position1[0], -position1[1]);
            context.stroke();
            context.restore();
        }
    }
}

function drawVertexIfNecessary(context: CanvasRenderingContext2D,
                               position: Float32Array,
                               invScaleFactor: number) {
    context.beginPath();
    context.moveTo(position[0], -position[1]);
    context.arc(position[0], -position[1], POINT_RADIUS * invScaleFactor, 0, 2.0 * Math.PI);
    context.fill();
}

function drawSegmentVertex(context: CanvasRenderingContext2D,
                           position: glmatrix.vec2,
                           invScaleFactor: number) {
    context.save();
    context.fillStyle = SEGMENT_POINT_FILL_STYLE;
    context.lineWidth = invScaleFactor * SEGMENT_STROKE_WIDTH;
    context.beginPath();
    context.arc(position[0],
                -position[1],
                SEGMENT_POINT_RADIUS * invScaleFactor,
                0,
                2.0 * Math.PI);
    context.fill();
    context.restore();
}

function drawSegmentControlPoint(context: CanvasRenderingContext2D,
                                 position: glmatrix.vec2,
                                 invScaleFactor: number) {
    context.save();
    context.strokeStyle = SEGMENT_CONTROL_POINT_STROKE_STYLE;
    context.fillStyle = SEGMENT_CONTROL_POINT_FILL_STYLE;
    context.lineWidth = invScaleFactor * SEGMENT_CONTROL_POINT_STROKE_WIDTH;
    context.beginPath();
    context.arc(position[0],
                -position[1],
                SEGMENT_POINT_RADIUS * invScaleFactor,
                0,
                2.0 * Math.PI);
    context.fill();
    context.stroke();
    context.restore();
}

function drawNormal(context: CanvasRenderingContext2D,
                    position: glmatrix.vec2,
                    normalVector: glmatrix.vec2,
                    invScaleFactor: number,
                    normalType: NormalType) {
    const length = invScaleFactor * NORMAL_LENGTHS[normalType];
    const arrowheadLength = invScaleFactor * NORMAL_ARROWHEAD_LENGTH;
    const endpoint = glmatrix.vec2.clone([position[0] + length * normalVector[0],
                                          -position[1] + length * -normalVector[1]]);

    context.save();
    context.strokeStyle = NORMAL_STROKE_STYLES[normalType];
    context.beginPath();
    context.moveTo(position[0], -position[1]);
    context.lineTo(endpoint[0], endpoint[1]);
    context.lineTo(endpoint[0] + arrowheadLength *
                   (Math.cos(NORMAL_ARROWHEAD_ANGLE) * normalVector[0] +
                    Math.sin(NORMAL_ARROWHEAD_ANGLE) * normalVector[1]),
                   endpoint[1] + arrowheadLength *
                   (Math.sin(NORMAL_ARROWHEAD_ANGLE) * normalVector[0] -
                    Math.cos(NORMAL_ARROWHEAD_ANGLE) * normalVector[1]));
    context.stroke();
    context.beginPath();
    context.moveTo(endpoint[0], endpoint[1]);
    context.lineTo(endpoint[0] + arrowheadLength *
                   (Math.cos(NORMAL_ARROWHEAD_ANGLE) * normalVector[0] -
                    Math.sin(NORMAL_ARROWHEAD_ANGLE) * normalVector[1]),
                   endpoint[1] - arrowheadLength *
                   (Math.cos(NORMAL_ARROWHEAD_ANGLE) * normalVector[1] +
                    Math.sin(NORMAL_ARROWHEAD_ANGLE) * normalVector[0]));
    context.stroke();
    context.restore();
}

function main() {
    const controller = new MeshDebuggerAppController;
    window.addEventListener('load', () => controller.start(), false);
}

main();
