import {describe, test, expect, vi} from 'vitest';
import {RenderToTexture} from './render_to_texture';
import type {Painter} from './painter';
import type {LineStyleLayer} from '../style/style_layer/line_style_layer';
import type {SymbolStyleLayer} from '../style/style_layer/symbol_style_layer';
import {Context} from '../gl/context';
import {ColorMode} from '../gl/color_mode';
import {Terrain} from './terrain';
import {type Style} from '../style/style';
import {Tile} from '../source/tile';
import {type Map} from '../ui/map';
import {OverscaledTileID} from '../source/tile_id';
import {type SourceCache} from '../source/source_cache';
import {type TerrainSpecification} from '@maplibre/maplibre-gl-style-spec';
import {type FillStyleLayer} from '../style/style_layer/fill_style_layer';
import {type RasterStyleLayer} from '../style/style_layer/raster_style_layer';
import {type HillshadeStyleLayer} from '../style/style_layer/hillshade_style_layer';
import {type BackgroundStyleLayer} from '../style/style_layer/background_style_layer';
import {DepthMode} from '../gl/depth_mode';

describe('render to texture', () => {
    const gl = document.createElement('canvas').getContext('webgl');
    vi.spyOn(gl, 'checkFramebufferStatus').mockReturnValue(gl.FRAMEBUFFER_COMPLETE);
    const backgroundLayer = {
        id: 'maine-background',
        type: 'background',
        source: 'maine',
        isHidden: () => false
    } as any as BackgroundStyleLayer;
    const fillLayer = {
        id: 'maine-fill',
        type: 'fill',
        source: 'maine',
        isHidden: () => false
    } as any as FillStyleLayer;
    const rasterLayer = {
        id: 'maine-raster',
        type: 'raster',
        source: 'maine',
        isHidden: () => false
    } as any as RasterStyleLayer;
    const hillshadeLayer = {
        id: 'maine-hillshade',
        type: 'line',
        source: 'maine',
        isHidden: () => false
    } as any as HillshadeStyleLayer;
    const lineLayer = {
        id: 'maine-line',
        type: 'line',
        source: 'maine',
        isHidden: () => false
    } as any as LineStyleLayer;
    const symbolLayer = {
        id: 'maine-symbol',
        type: 'symbol',
        source: 'maine',
        layout: {
            'text-field': 'maine',
            'symbol-placement': 'line'
        },
        isHidden: () => false
    } as any as SymbolStyleLayer;

    let layersDrawn = 0;
    const painter = {
        layersDrawn: 0,
        context: new Context(gl),
        transform: {zoom: 10, calculatePosMatrix: () => {}, getProjectionData(_a) {}, calculateFogMatrix: () => {}},
        colorModeForRenderPass: () => ColorMode.alphaBlended,
        getDepthModeFor3D: () => DepthMode.disabled,
        useProgram: () => { return {draw: () => { layersDrawn++; }}; },
        _renderTileClippingMasks: () => {},
        renderLayer: () => {}
    } as any as Painter;
    const map = {painter} as Map;

    const tile = new Tile(new OverscaledTileID(3, 0, 2, 1, 2), 512);
    const sourceCache = {
        _source: {minzoom: 0, maxzoom: 2},
        getTileByID: (_id) => tile,
        getVisibleCoordinates: () => [tile.tileID]
    } as SourceCache;

    const style = {
        sourceCaches: {'maine': {getVisibleCoordinates: () => [tile.tileID], getSource: () => ({})}},
        _order: ['maine-fill', 'maine-symbol'],
        _layers: {
            'maine-background': backgroundLayer,
            'maine-fill': fillLayer,
            'maine-raster': rasterLayer,
            'maine-hillshade': hillshadeLayer,
            'maine-line': lineLayer,
            'maine-symbol': symbolLayer
        },
        projection: {
            transitionState: 0,
        }
    } as any as Style;
    painter.style = style;
    map.style = style;
    style.map = map;

    const terrain = new Terrain(painter, sourceCache, {} as any as TerrainSpecification);
    terrain.sourceCache.getRenderableTiles = () => [tile];
    terrain.sourceCache.getTerrainCoords = () => { return {[tile.tileID.key]: tile.tileID}; };
    map.terrain = terrain;

    const rtt = new RenderToTexture(painter, terrain);
    rtt.prepareForRender(style, 0);
    painter.renderToTexture = rtt;

    test('check state', () => {
        expect(rtt._renderableTiles.map(t => t.tileID.key)).toStrictEqual(['923']);
        expect(rtt._coordsAscending).toEqual({
            'maine': {
                '923': [
                    {
                        'canonical': {
                            'key': '922',
                            'x': 1,
                            'y': 2,
                            'z': 2
                        },
                        'key': '923',
                        'overscaledZ': 3,
                        'wrap': 0,
                        'terrainRttPosMatrix32f': null,
                    }
                ]
            }
        });
        expect(rtt._coordsAscendingStr).toStrictEqual({maine: {'923': '923'}});
    });

    test('should render text after a line by not adding the text to the stack', () => {
        style._order = ['maine-fill', 'maine-symbol'];
        rtt.prepareForRender(style, 0);
        layersDrawn = 0;
        const renderOptions = {isRenderingToTexture: false, isRenderingGlobe: false};
        expect(rtt._renderableLayerIds).toStrictEqual(['maine-fill', 'maine-symbol']);
        expect(rtt.renderLayer(fillLayer, renderOptions)).toBeTruthy();
        expect(rtt.renderLayer(symbolLayer, renderOptions)).toBeFalsy();
        expect(layersDrawn).toBe(1);
    });

    test('render symbol between rtt layers', () => {
        style._order = ['maine-background', 'maine-fill', 'maine-raster', 'maine-hillshade', 'maine-symbol', 'maine-line', 'maine-symbol'];
        rtt.prepareForRender(style, 0);
        layersDrawn = 0;
        const renderOptions = {isRenderingToTexture: false, isRenderingGlobe: false};
        expect(rtt._renderableLayerIds).toStrictEqual(['maine-background', 'maine-fill', 'maine-raster', 'maine-hillshade', 'maine-symbol', 'maine-line', 'maine-symbol']);
        expect(rtt.renderLayer(backgroundLayer, renderOptions)).toBeTruthy();
        expect(rtt.renderLayer(fillLayer, renderOptions)).toBeTruthy();
        expect(rtt.renderLayer(rasterLayer, renderOptions)).toBeTruthy();
        expect(rtt.renderLayer(hillshadeLayer, renderOptions)).toBeTruthy();
        expect(rtt.renderLayer(symbolLayer, renderOptions)).toBeFalsy();
        expect(rtt.renderLayer(lineLayer, renderOptions)).toBeTruthy();
        expect(rtt.renderLayer(symbolLayer, renderOptions)).toBeFalsy();
        expect(layersDrawn).toBe(2);
    });

    test('render more symbols between rtt layers', () => {
        style._order = ['maine-background', 'maine-symbol', 'maine-hillshade', 'maine-symbol', 'maine-line', 'maine-symbol'];
        rtt.prepareForRender(style, 0);
        layersDrawn = 0;
        const renderOptions = {isRenderingToTexture: false, isRenderingGlobe: false};
        expect(rtt._renderableLayerIds).toStrictEqual(['maine-background', 'maine-symbol', 'maine-hillshade', 'maine-symbol', 'maine-line', 'maine-symbol']);
        expect(rtt.renderLayer(backgroundLayer, renderOptions)).toBeTruthy();
        expect(rtt.renderLayer(symbolLayer, renderOptions)).toBeFalsy();
        expect(rtt.renderLayer(hillshadeLayer, renderOptions)).toBeTruthy();
        expect(rtt.renderLayer(symbolLayer, renderOptions)).toBeFalsy();
        expect(rtt.renderLayer(lineLayer, renderOptions)).toBeTruthy();
        expect(rtt.renderLayer(symbolLayer, renderOptions)).toBeFalsy();
        expect(layersDrawn).toBe(3);
    });
});
