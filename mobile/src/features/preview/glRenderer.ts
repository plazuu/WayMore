import * as THREE from 'three';

import type { ExpoWebGLRenderingContext } from 'expo-gl';

/**
 * A three.js renderer on an expo-gl context. three.js expects a DOM canvas,
 * so it gets a minimal stand-in; on web GLView already hands us a real one.
 */
export function createGLRenderer(gl: ExpoWebGLRenderingContext): THREE.WebGLRenderer {
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  const canvas = {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    style: {},
    addEventListener: () => {},
    removeEventListener: () => {},
    getContext: () => gl,
  } as unknown as HTMLCanvasElement;

  // Only texture uploads use most pixelStorei params, and expo-gl logs a warning for each one it
  // doesn't support. This scene has no textures, so keep the two that matter and drop the rest.
  const pixelStorei = gl.pixelStorei.bind(gl);
  gl.pixelStorei = (pname: number, param: number | boolean) => {
    if (pname === gl.UNPACK_ALIGNMENT || pname === gl.PACK_ALIGNMENT) pixelStorei(pname, param as number);
  };

  // three.js rejects anything that passes `instanceof WebGLRenderingContext` as WebGL 1. expo-gl's
  // context can pass that check while being WebGL 2, so hide the global while the renderer checks.
  const g = globalThis as { WebGLRenderingContext?: unknown };
  const webgl1 = g.WebGLRenderingContext;
  const isWebGL2 = typeof (gl as unknown as WebGL2RenderingContext).createVertexArray === 'function';
  if (isWebGL2) g.WebGLRenderingContext = undefined;
  try {
    const renderer = new THREE.WebGLRenderer({
      canvas,
      context: gl as unknown as WebGL2RenderingContext,
      antialias: true,
    });
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    return renderer;
  } finally {
    if (isWebGL2) g.WebGLRenderingContext = webgl1;
  }
}
