/*
 * GPU fluid solver adapted from WebGL Fluid Simulation by Pavel Dobryakov.
 * Copyright (c) 2017 Pavel Dobryakov — MIT, see vendor/fluid-LICENSE.txt.
 * Dedicated integration: no GUI, listeners, seed splats or animation loop.
 */
(function (global) {
  'use strict';
  const defaults = Object.freeze({
    simResolution: 128, dyeResolution: 1440, maxDyePixels: 4_000_000,
    densityDissipation: .5, velocityDissipation: 3, pressure: .1,
    pressureIterations: 20, curl: 3, splatRadius: .2, splatForce: 6000,
    shading: true
  });
  const shaders = {
    vertex: `
      precision highp float;
      attribute vec2 aPosition;
      varying vec2 vUv;
      varying vec2 vL;
      varying vec2 vR;
      varying vec2 vT;
      varying vec2 vB;
      uniform vec2 texelSize;
      void main () {
        vUv = aPosition * .5 + .5;
        vL = vUv - vec2(texelSize.x, 0.0);
        vR = vUv + vec2(texelSize.x, 0.0);
        vT = vUv + vec2(0.0, texelSize.y);
        vB = vUv - vec2(0.0, texelSize.y);
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }`,
    fade: `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      uniform sampler2D uTexture;
      uniform float value;
      void main () { gl_FragColor = value * texture2D(uTexture, vUv); }`,
    splat: `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      uniform sampler2D uTarget;
      uniform float aspectRatio;
      uniform vec3 color;
      uniform vec2 point;
      uniform float radius;
      void main () {
        vec2 p = vUv - point;
        p.x *= aspectRatio;
        vec3 dye = exp(-dot(p, p) / radius) * color;
        gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + dye, 1.0);
      }`,
    advection: `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      uniform sampler2D uVelocity;
      uniform sampler2D uSource;
      uniform vec2 texelSize;
      uniform vec2 sourceTexelSize;
      uniform float dt;
      uniform float dissipation;
      vec4 bilerp (sampler2D image, vec2 uv, vec2 pixel) {
        vec2 st = uv / pixel - .5;
        vec2 i = floor(st), f = fract(st);
        vec4 a = texture2D(image, (i + vec2(.5, .5)) * pixel);
        vec4 b = texture2D(image, (i + vec2(1.5, .5)) * pixel);
        vec4 c = texture2D(image, (i + vec2(.5, 1.5)) * pixel);
        vec4 d = texture2D(image, (i + vec2(1.5, 1.5)) * pixel);
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      void main () {
        #ifdef MANUAL_FILTERING
          vec2 velocity = bilerp(uVelocity, vUv, texelSize).xy;
          vec2 coord = vUv - dt * velocity * texelSize;
          vec4 result = bilerp(uSource, coord, sourceTexelSize);
        #else
          vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
          vec4 result = texture2D(uSource, coord);
        #endif
        gl_FragColor = result / (1.0 + dissipation * dt);
      }`,
    divergence: `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      varying vec2 vL;
      varying vec2 vR;
      varying vec2 vT;
      varying vec2 vB;
      uniform sampler2D uVelocity;
      void main () {
        float L = texture2D(uVelocity, vL).x;
        float R = texture2D(uVelocity, vR).x;
        float T = texture2D(uVelocity, vT).y;
        float B = texture2D(uVelocity, vB).y;
        vec2 C = texture2D(uVelocity, vUv).xy;
        if (vL.x < 0.0) L = -C.x;
        if (vR.x > 1.0) R = -C.x;
        if (vT.y > 1.0) T = -C.y;
        if (vB.y < 0.0) B = -C.y;
        gl_FragColor = vec4(.5 * (R - L + T - B), 0.0, 0.0, 1.0);
      }`,
    curl: `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vL;
      varying vec2 vR;
      varying vec2 vT;
      varying vec2 vB;
      uniform sampler2D uVelocity;
      void main () {
        float L = texture2D(uVelocity, vL).y;
        float R = texture2D(uVelocity, vR).y;
        float T = texture2D(uVelocity, vT).x;
        float B = texture2D(uVelocity, vB).x;
        gl_FragColor = vec4(.5 * (R - L - T + B), 0.0, 0.0, 1.0);
      }`,
    vorticity: `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      varying vec2 vL;
      varying vec2 vR;
      varying vec2 vT;
      varying vec2 vB;
      uniform sampler2D uVelocity;
      uniform sampler2D uCurl;
      uniform float curl;
      uniform float dt;
      void main () {
        float L = texture2D(uCurl, vL).x;
        float R = texture2D(uCurl, vR).x;
        float T = texture2D(uCurl, vT).x;
        float B = texture2D(uCurl, vB).x;
        float C = texture2D(uCurl, vUv).x;
        vec2 force = .5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
        force /= length(force) + .0001;
        force *= curl * C;
        force.y *= -1.0;
        vec2 velocity = texture2D(uVelocity, vUv).xy + force * dt;
        gl_FragColor = vec4(clamp(velocity, -1000.0, 1000.0), 0.0, 1.0);
      }`,
    pressure: `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      varying vec2 vL;
      varying vec2 vR;
      varying vec2 vT;
      varying vec2 vB;
      uniform sampler2D uPressure;
      uniform sampler2D uDivergence;
      void main () {
        float L = texture2D(uPressure, vL).x;
        float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x;
        float B = texture2D(uPressure, vB).x;
        float div = texture2D(uDivergence, vUv).x;
        gl_FragColor = vec4((L + R + T + B - div) * .25, 0.0, 0.0, 1.0);
      }`,
    gradient: `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      varying vec2 vL;
      varying vec2 vR;
      varying vec2 vT;
      varying vec2 vB;
      uniform sampler2D uPressure;
      uniform sampler2D uVelocity;
      void main () {
        float L = texture2D(uPressure, vL).x;
        float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x;
        float B = texture2D(uPressure, vB).x;
        vec2 velocity = texture2D(uVelocity, vUv).xy - vec2(R - L, T - B);
        gl_FragColor = vec4(velocity, 0.0, 1.0);
      }`,
    display: `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      varying vec2 vL;
      varying vec2 vR;
      varying vec2 vT;
      varying vec2 vB;
      uniform sampler2D uTexture;
      uniform vec2 texelSize;
      uniform vec2 canvasSize;
      uniform float opacity;
      uniform float shading;
      uniform int maskCount;
      uniform vec4 masks[12];
      void main () {
        vec3 c = texture2D(uTexture, vUv).rgb;
        if (shading > .5) {
          vec3 lc = texture2D(uTexture, vL).rgb;
          vec3 rc = texture2D(uTexture, vR).rgb;
          vec3 tc = texture2D(uTexture, vT).rgb;
          vec3 bc = texture2D(uTexture, vB).rgb;
          float dx = length(rc) - length(lc);
          float dy = length(tc) - length(bc);
          vec3 normal = normalize(vec3(dx, dy, length(texelSize)));
          float diffuse = clamp(dot(normal, vec3(0.0, 0.0, 1.0)) + .7, .7, 1.0);
          c *= diffuse;
        }
        float protection = 1.0;
        vec2 pixel = vec2(vUv.x, 1.0 - vUv.y) * canvasSize;
        for (int i = 0; i < 12; i++) {
          if (i >= maskCount) break;
          vec4 box = masks[i];
          vec2 q = abs(pixel - box.xy - box.zw * .5) - box.zw * .5;
          float distance = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
          protection = min(protection, mix(.18, 1.0, smoothstep(-4.0, 18.0, distance)));
        }
        c = clamp(c, 0.0, 1.0);
        float a = max(c.r, max(c.g, c.b));
        float fade = clamp(opacity, 0.0, 1.0) * protection;
        // Premultiplied color and alpha fade together over the page background.
        gl_FragColor = vec4(c * fade, a * fade);
      }`
  };

  function sourceFor(source, vertex, webgl2, manual) {
    let code = source;
    if (webgl2) {
      code = code.replace(/\battribute\b/g, 'in').replace(/\bvarying\b/g, vertex ? 'out' : 'in').replace(/\btexture2D\b/g, 'texture');
      if (!vertex) code = code.replace(/\bgl_FragColor\b/g, 'fluidColor');
      code = '#version 300 es\n' + (manual ? '#define MANUAL_FILTERING\n' : '') + code;
      if (!vertex) code = code.replace('precision highp float;', 'precision highp float;\nout vec4 fluidColor;');
    } else if (manual) code = '#define MANUAL_FILTERING\n' + code;
    return code;
  }

  function makeEngine(canvas, options) {
    const config = { ...defaults, ...options };
    const attributes = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false, premultipliedAlpha: true };
    let gl = canvas.getContext('webgl2', attributes), webgl2 = !!gl;
    if (!gl) gl = canvas.getContext('webgl', attributes) || canvas.getContext('experimental-webgl', attributes);
    if (!gl) return null;
    let half;
    if (webgl2) {
      gl.getExtension('EXT_color_buffer_float');
      half = gl.HALF_FLOAT;
    } else {
      const extension = gl.getExtension('OES_texture_half_float');
      if (!extension) return null;
      half = extension.HALF_FLOAT_OES;
      gl.getExtension('EXT_color_buffer_half_float');
    }
    const linear = webgl2 ? !!gl.getExtension('OES_texture_float_linear') : !!gl.getExtension('OES_texture_half_float_linear');
    const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
    const allocations = new Set(), programs = [], shaderHandles = [];
    let disposed = false, cssWidth = 1, cssHeight = 1;
    let velocity, dye, divergence, curl, pressure;
    let quality = null;
    const safe = () => !disposed && !gl.isContextLost();

    function createProgram(fragment) {
      function compile(type, text) {
        const handle = gl.createShader(type);
        shaderHandles.push(handle);
        gl.shaderSource(handle, sourceFor(text, type === gl.VERTEX_SHADER, webgl2, !linear));
        gl.compileShader(handle);
        if (!gl.getShaderParameter(handle, gl.COMPILE_STATUS)) throw new Error('Fluid shader: ' + gl.getShaderInfoLog(handle));
        return handle;
      }
      const program = gl.createProgram(); programs.push(program);
      gl.attachShader(program, compile(gl.VERTEX_SHADER, shaders.vertex));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
      gl.bindAttribLocation(program, 0, 'aPosition'); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Fluid link: ' + gl.getProgramInfoLog(program));
      const uniforms = Object.create(null);
      const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const name = gl.getActiveUniform(program, i).name;
        uniforms[name.replace(/\[0\]$/, '')] = gl.getUniformLocation(program, name);
      }
      return { program, uniforms };
    }
    function use(program, texel) {
      gl.useProgram(program.program);
      if (program.uniforms.texelSize != null) gl.uniform2f(program.uniforms.texelSize, texel[0], texel[1]);
      return program.uniforms;
    }
    const vertices = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    function supportedFormat(internal, format) {
      const texture = gl.createTexture(), framebuffer = gl.createFramebuffer();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, 2, 2, 0, format, half, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      const supported = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.deleteTexture(texture); gl.deleteFramebuffer(framebuffer);
      return supported ? { internal, format } : null;
    }
    const rgba = supportedFormat(webgl2 ? gl.RGBA16F : gl.RGBA, gl.RGBA);
    if (!rgba) { gl.deleteBuffer(vertices); return null; }
    const rg = webgl2 ? supportedFormat(gl.RG16F, gl.RG) || rgba : rgba;
    const r = webgl2 ? supportedFormat(gl.R16F, gl.RED) || rg : rgba;
    const programsByName = Object.create(null);
    try {
      for (const name of Object.keys(shaders)) if (name !== 'vertex') programsByName[name] = createProgram(shaders[name]);
    } catch (error) {
      programs.forEach(program => gl.deleteProgram(program)); shaderHandles.forEach(shader => gl.deleteShader(shader)); gl.deleteBuffer(vertices);
      throw error;
    }
    // Programs retain compiled shader objects after linking; release the extra handles.
    shaderHandles.forEach(shader => gl.deleteShader(shader)); shaderHandles.length = 0;

    function free(target) {
      if (!target) return;
      gl.deleteTexture(target.texture); gl.deleteFramebuffer(target.framebuffer); allocations.delete(target);
    }
    function fbo(width, height, format, filtering) {
      const texture = gl.createTexture(), framebuffer = gl.createFramebuffer();
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filtering);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filtering);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, format.internal, width, height, 0, format.format, half, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { gl.deleteTexture(texture); gl.deleteFramebuffer(framebuffer); throw new Error('Fluid framebuffer unavailable'); }
      const target = { texture, framebuffer, width, height, texel: [1 / width, 1 / height] };
      allocations.add(target); gl.viewport(0, 0, width, height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      return target;
    }
    function double(width, height, format, filtering) {
      return { read: fbo(width,height,format,filtering), write: fbo(width,height,format,filtering), swap() { const old = this.read; this.read = this.write; this.write = old; } };
    }
    function attach(target, unit) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, target.texture); return unit; }
    function draw(target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
      gl.viewport(0, 0, target ? target.width : canvas.width, target ? target.height : canvas.height);
      gl.bindBuffer(gl.ARRAY_BUFFER, vertices); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    function resolution(shortSide, pixelBudget = Infinity) {
      const aspect = cssWidth / cssHeight;
      let width = aspect >= 1 ? shortSide * aspect : shortSide;
      let height = aspect >= 1 ? shortSide : shortSide / aspect;
      const ratio = Math.min(1, maxTexture / Math.max(width,height), Math.sqrt(pixelBudget / (width * height)));
      return [Math.max(2, Math.round(width * ratio)), Math.max(2, Math.round(height * ratio))];
    }
    function setSize(width, height, dpr = 1) {
      if (!safe()) return false;
      cssWidth = Math.max(1, Number(width) || 1); cssHeight = Math.max(1, Number(height) || 1);
      const ratio = Math.min(2, Math.max(1, Number(dpr) || 1), Math.sqrt(4_000_000 / (cssWidth * cssHeight)));
      const outWidth = Math.max(1, Math.round(cssWidth * ratio)), outHeight = Math.max(1, Math.round(cssHeight * ratio));
      const [vw,vh] = resolution(config.simResolution), [dw,dh] = resolution(config.dyeResolution,config.maxDyePixels);
      if (quality && quality.cssWidth === cssWidth && quality.cssHeight === cssHeight && canvas.width === outWidth && canvas.height === outHeight) return true;
      for (const target of [...allocations]) free(target);
      canvas.width = outWidth; canvas.height = outHeight;
      const filtering = linear ? gl.LINEAR : gl.NEAREST;
      try {
        velocity = double(vw,vh,rg,filtering); dye = double(dw,dh,rgba,filtering);
        pressure = double(vw,vh,r,gl.NEAREST); divergence = fbo(vw,vh,r,gl.NEAREST); curl = fbo(vw,vh,r,gl.NEAREST);
      } catch (error) { for (const target of [...allocations]) free(target); velocity = dye = pressure = divergence = curl = null; quality = null; throw error; }
      quality = { cssWidth, cssHeight, canvasWidth: outWidth, canvasHeight: outHeight, velocityWidth: vw, velocityHeight: vh, dyeWidth: dw, dyeHeight: dh, manualFiltering: !linear, webgl2 };
      clear(); return true;
    }
    function clear() {
      if (!safe()) return;
      gl.disable(gl.BLEND); gl.clearColor(0,0,0,0);
      for (const target of allocations) { gl.bindFramebuffer(gl.FRAMEBUFFER,target.framebuffer); gl.viewport(0,0,target.width,target.height); gl.clear(gl.COLOR_BUFFER_BIT); }
      gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.viewport(0,0,canvas.width,canvas.height); gl.clear(gl.COLOR_BUFFER_BIT);
    }
    function splat(input) {
      if (!safe() || !quality || !input || !Number.isFinite(Number(input.x)) || !Number.isFinite(Number(input.y))) return false;
      const aspect = cssWidth / cssHeight;
      let dx = (Number.isFinite(Number(input.dx)) ? Number(input.dx) : 0) / cssWidth;
      let dy = -(Number.isFinite(Number(input.dy)) ? Number(input.dy) : 0) / cssHeight;
      if (aspect < 1) dx *= aspect;
      if (aspect > 1) dy /= aspect;
      const point = [Math.max(0,Math.min(1,input.x / cssWidth)),Math.max(0,Math.min(1,1 - input.y / cssHeight))];
      const supplied = input.color || hsv(Math.random()).map(value => value * .15);
      const color = [0,1,2].map(index => Math.max(0,Math.min(1,Number(supplied[index]) || 0)));
      gl.disable(gl.BLEND);
      const uniforms = use(programsByName.splat,velocity.read.texel);
      gl.uniform1f(uniforms.aspectRatio,aspect); gl.uniform2f(uniforms.point,point[0],point[1]);
      gl.uniform1f(uniforms.radius,config.splatRadius / 100 * (aspect > 1 ? aspect : 1));
      gl.uniform1i(uniforms.uTarget,attach(velocity.read,0)); gl.uniform3f(uniforms.color,dx * config.splatForce,dy * config.splatForce,0);
      draw(velocity.write); velocity.swap();
      gl.uniform1i(uniforms.uTarget,attach(dye.read,0)); gl.uniform3f(uniforms.color,color[0],color[1],color[2]);
      draw(dye.write); dye.swap(); return true;
    }
    function step(seconds) {
      if (!safe() || !quality) return false;
      const dt = Math.max(0,Math.min(Number(seconds) || 0,1 / 60));
      if (!dt) return false;
      gl.disable(gl.BLEND);
      let u = use(programsByName.curl,velocity.read.texel);
      gl.uniform1i(u.uVelocity,attach(velocity.read,0)); draw(curl);
      u = use(programsByName.vorticity,velocity.read.texel);
      gl.uniform1i(u.uVelocity,attach(velocity.read,0)); gl.uniform1i(u.uCurl,attach(curl,1)); gl.uniform1f(u.curl,config.curl); gl.uniform1f(u.dt,dt);
      draw(velocity.write); velocity.swap();
      u = use(programsByName.divergence,velocity.read.texel);
      gl.uniform1i(u.uVelocity,attach(velocity.read,0)); draw(divergence);
      u = use(programsByName.fade,pressure.read.texel);
      gl.uniform1i(u.uTexture,attach(pressure.read,0)); gl.uniform1f(u.value,config.pressure); draw(pressure.write); pressure.swap();
      u = use(programsByName.pressure,pressure.read.texel);
      gl.uniform1i(u.uDivergence,attach(divergence,0));
      for (let i = 0; i < config.pressureIterations; i++) { gl.uniform1i(u.uPressure,attach(pressure.read,1)); draw(pressure.write); pressure.swap(); }
      u = use(programsByName.gradient,velocity.read.texel);
      gl.uniform1i(u.uPressure,attach(pressure.read,0)); gl.uniform1i(u.uVelocity,attach(velocity.read,1)); draw(velocity.write); velocity.swap();
      u = use(programsByName.advection,velocity.read.texel);
      gl.uniform1i(u.uVelocity,attach(velocity.read,0)); gl.uniform1i(u.uSource,attach(velocity.read,1)); if (u.sourceTexelSize != null) gl.uniform2f(u.sourceTexelSize,...velocity.read.texel);
      gl.uniform1f(u.dt,dt); gl.uniform1f(u.dissipation,config.velocityDissipation); draw(velocity.write); velocity.swap();
      gl.uniform1i(u.uVelocity,attach(velocity.read,0)); gl.uniform1i(u.uSource,attach(dye.read,1)); if (u.sourceTexelSize != null) gl.uniform2f(u.sourceTexelSize,...dye.read.texel);
      gl.uniform1f(u.dissipation,config.densityDissipation); draw(dye.write); dye.swap(); return true;
    }
    function render({ opacity = 1, mask = [] } = {}) {
      if (!safe() || !quality) return false;
      gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.viewport(0,0,canvas.width,canvas.height);
      gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      const u = use(programsByName.display,dye.read.texel);
      gl.uniform1i(u.uTexture,attach(dye.read,0)); gl.uniform2f(u.canvasSize,cssWidth,cssHeight);
      gl.uniform1f(u.opacity,Math.max(0,Math.min(1,Number(opacity) || 0))); gl.uniform1f(u.shading,config.shading ? 1 : 0);
      const boxes = mask.slice(0,12), data = new Float32Array(48);
      boxes.forEach((box,index) => { data[index*4] = box.x; data[index*4+1] = box.y; data[index*4+2] = box.width ?? box.w; data[index*4+3] = box.height ?? box.h; });
      gl.uniform1i(u.maskCount,boxes.length); gl.uniform4fv(u.masks,data);
      draw(null); gl.disable(gl.BLEND); return true;
    }
    function destroy() {
      if (disposed) return;
      for (const target of [...allocations]) free(target);
      programs.forEach(program => gl.deleteProgram(program)); gl.deleteBuffer(vertices);
      disposed = true; quality = null;
    }
    return { setSize, splat, step, render, clear, destroy, get quality() { return quality && { ...quality }; } };
  }
  function hsv(hue) {
    const h = ((hue % 1) + 1) % 1 * 6, i = Math.floor(h), f = h - i;
    return [[1,f,0],[1-f,1,0],[0,1,f],[0,1-f,1],[f,0,1],[1,0,1-f]][i % 6];
  }
  function create(canvas, options = {}) {
    try { return makeEngine(canvas,options); }
    catch (error) { if (typeof options.onFailure === 'function') options.onFailure(error); return null; }
  }
  global.SamirFluid = Object.freeze({ create, defaults });
})(typeof window !== 'undefined' ? window : globalThis);
