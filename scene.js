'use strict';

const identity = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const scale = (v, factor) => v.map(x => x * factor);
const add = (a, b) => a.map((v, i) => v + b[i]);
const transform = (matrix, v) => matrix.map(row => dot(row, v));
const transpose = matrix => matrix[0].map((_, i) => matrix.map(row => row[i]));
const multiply = (left, right) => transpose(transpose(right).map(column => transform(left, column)));
const cross = ([a, b, c], [x, y, z]) => [b * z - c * y, c * x - a * z, a * y - b * x];

function axisRotation([x, y, z], angle) {
  const c = Math.cos(angle), s = Math.sin(angle), v = 1 - c;
  return [
    [c + x*x*v, x*y*v - z*s, x*z*v + y*s],
    [y*x*v + z*s, c + y*y*v, y*z*v - x*s],
    [z*x*v - y*s, z*y*v + x*s, c + z*z*v]
  ];
}

function operationPath(op, t) {
  if (t <= 0) return identity;
  if (t >= 1) return op.matrix;
  if (op.kind === 'identity') return identity;
  if (op.kind === 'rotation') return axisRotation(op.axis, op.angle * t);
  if (op.kind === 'inversion') return identity.map(row => scale(row, 1 - 2*t));
  // Reflections cross a singular matrix. The interpolation is a visual aid.
  const rotationPhase = op.kind === 'improper' ? Math.min(1, t / .55) : 0;
  const reflectionPhase = op.kind === 'improper' ? Math.max(0, (t - .55) / .45) : t;
  const normal = op.normal;
  const reflection = identity.map((row, i) => row.map((v, j) => v - 2*reflectionPhase*normal[i]*normal[j]));
  return multiply(axisRotation(op.axis, op.angle * rotationPhase), reflection);
}

function canvasView(canvas, camera, ratio, center = [.5,.5]) {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const pixels = [Math.round(width * dpr), Math.round(height * dpr)];
  if (canvas.width !== pixels[0] || canvas.height !== pixels[1]) {
    [canvas.width, canvas.height] = pixels;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const a = camera.yaw, e = camera.elevation;
  const right = [-Math.sin(a), Math.cos(a), 0];
  const up = [-Math.cos(a)*Math.sin(e), -Math.sin(a)*Math.sin(e), Math.cos(e)];
  const forward = [Math.cos(a)*Math.cos(e), Math.sin(a)*Math.cos(e), Math.sin(e)];
  function project(point) {
    const z = dot(point, forward);
    const perspective = ratio * Math.min(width, height) * camera.zoom / (1 - .105*z);
    return [width*center[0] + dot(point, right)*perspective, height*center[1] - dot(point, up)*perspective, z];
  }
  function path(points, color, lineWidth = 1, dash = [], fill = null) {
    if (!points.length) return;
    ctx.beginPath();
    const [x,y] = project(points[0]);
    ctx.moveTo(x, y);
    for (const point of points.slice(1)) {
      const [px,py] = project(point);
      ctx.lineTo(px, py);
    }
    if (fill) { ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
    ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  function point(v, color, radius, filled = true, glow = false) {
    const [x,y] = project(v);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2*Math.PI);
    if (filled) {
      ctx.shadowColor = color;
      ctx.shadowBlur = glow ? 14 : 0;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      ctx.lineWidth = 1;
      ctx.strokeStyle = color;
      ctx.stroke();
    }
  }
  function label(v, text, color = '#c0d8fc', offset = [6,-5], font = '12px Georgia') {
    const [x,y] = project(v);
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(text, x+offset[0], y+offset[1]);
  }
  function sphere(v, color, radius) {
    const [x,y] = project(v);
    const highlight = ctx.createRadialGradient(x-radius*.34,y-radius*.39,0,x,y,radius);
    highlight.addColorStop(0,'#f5faff');
    highlight.addColorStop(.38,color);
    highlight.addColorStop(1,'#162843');
    ctx.beginPath();
    ctx.arc(x,y,radius,0,2*Math.PI);
    ctx.fillStyle=highlight;
    ctx.fill();
    ctx.strokeStyle=color;
    ctx.lineWidth=.8;
    ctx.stroke();
  }
  return {project, path, point, label, sphere};
}

function drawGrid(view, radius, z, step, color) {
  for (let i = -radius; i <= radius + .001; i += step) {
    view.path([[-radius,i,z],[radius,i,z]], color);
    view.path([[i,-radius,z],[i,radius,z]], color);
  }
}

function ring(radius, z, start = 0, span = 2*Math.PI) {
  return Array.from({length: 73}, (_, i) => {
    const a = start + span*i/72;
    return [radius*Math.cos(a), radius*Math.sin(a), z];
  });
}

function drawHero() {
  const canvas = document.querySelector('#hero-model');
  const camera = {yaw: .69, elevation: .43, zoom: 1};
  const view = canvasView(canvas, camera, .287, [.52,.467]);
  drawGrid(view, 1.65, -1.03, .33, '#7eaee82b');
  view.path(ring(1.26, -.92), '#77a7e06b', 1, [4,5]);
  view.path(ring(1.49, -.92), '#6797d54d', 1);
  view.path(ring(1.46, .25, -2.53, 4.98), '#9dd2ff9c', 1.35, [5,5]);
  view.path(ring(1.46, .25, 1.63, .82), '#c2e5ff', 1.7);
  const vertices = [-.8,.8].flatMap(x => [-.8,.8].flatMap(y => [-.8,.8].map(z => [x,y,z])));
  const faces = [[0,1,3,2],[0,1,5,4],[1,3,7,5],[0,2,6,4],[2,3,7,6],[4,5,7,6]];
  const sortedFaces = faces.map(face => face.map(i => vertices[i])).sort((a,b) => dot(a.map(p=>view.project(p)[2]), [.25,.25,.25,.25]) - dot(b.map(p=>view.project(p)[2]), [.25,.25,.25,.25]));
  for (const face of sortedFaces) view.path(face, '#a3cfff9c', 1.35, [], '#4a8ad522');
  for (let i=0; i<vertices.length; i++) {
    for (let j=i+1; j<vertices.length; j++) {
      if (vertices[i].filter((v,k)=>v!==vertices[j][k]).length===1) {
        view.path([vertices[i],vertices[j]], '#b5dbff91', 1.3);
      }
    }
  }
  view.path([[-1.6,0,0],[1.6,0,0]], '#a9cfff58', 1, [3,4]);
  view.path([[0,-1.6,0],[0,1.6,0]], '#a9cfff58', 1, [3,4]);
  view.path([[0,0,-1.27],[0,0,1.37]], '#d1eaffb9', 1.4, [5,5]);
  view.path([[0,-.08,1.25],[0,0,1.37],[0,.08,1.25]], '#c8e6ff', 1.25);
  view.label([0,0,1.37], 'z');
  view.label([1.60,0,0], 'x');
  view.label([0,1.60,0], 'y');
  for (const vertex of vertices.sort((a,b)=>view.project(a)[2]-view.project(b)[2])) {
    view.point(vertex, '#77baff', 6, true, true);
    view.point(vertex, '#d7ecff', 3.25);
  }
  view.point([0,0,0], '#c3e2ff', 3.2, false);
  const marker = ring(1.46,.25,2.45,0)[0];
  view.point(marker, '#f8fbff', 4, true, true);
  view.label(marker, '90°', '#e7f4ff', [9,1], '12px Consolas');
}

const elementStyle = {
  H:['#eaf6ff',8], C:['#8496b2',11], N:['#7ba9ff',13], O:['#ff8278',12],
  F:['#7de0bc',11], Cl:['#b4df7c',13], Br:['#efa66e',13],
  B:['#f9b4a6',11], S:['#ffda78',14], Xe:['#c2abff',15]
};
const faceColors = {'斜面Ⅰ':'#539dce','斜面Ⅱ':'#6aaaac','轴向面':'#3e638f','配位面':'#528fe5',
  '底面':'#385d91','锥面':'#5b9de2','五边形晶面':'#d3ad62'};

function faceCenter(points) {
  return scale(points.reduce(add,[0,0,0]),1/points.length);
}

function modelEdges(model) {
  const edges = new Map();
  for (const {indices} of model.faces) {
    indices.forEach((a,i)=>{
      const b=indices[(i+1)%indices.length];
      edges.set(Math.min(a,b)+':'+Math.max(a,b),[a,b]);
    });
  }
  for (const [a,b] of model.bonds) edges.set(Math.min(a,b)+':'+Math.max(a,b),[a,b]);
  return [...edges.values()];
}

function siteLabel(site,index) {
  return site.kind==='顶点' ? 'V'+(index+1) : site.kind+(index+1);
}

function drawStructure(canvas, state, settings) {
  const view = canvasView(canvas, state.camera, .32, [.5,.47]);
  const op = state.group.operations[state.operation];
  const base = state.group.operations[state.start].matrix;
  const pose = multiply(operationPath(op,state.progress),base);
  drawGrid(view, 1.44, -1.24, .36, '#6c97c52a');
  if (op.normal) {
    const normal = op.normal;
    const raw = cross(normal, Math.abs(normal[2]) < .85 ? [0,0,1] : [1,0,0]);
    const u = scale(raw, 1/Math.hypot(...raw)), v = cross(normal, u);
    const disk = ring(1.22, 0).map(([x,y]) => add(scale(u,x), scale(v,y)));
    view.path(disk, '#8dcbff8a', 1, [], '#67b8ff25');
  }
  if (op.kind === 'rotation' || op.kind === 'improper') {
    view.path([scale(op.axis,-1.38),scale(op.axis,1.38)], '#97d1ff', 1.65, [4,4]);
  }
  identity.forEach((axis, i) => {
    view.path([scale(axis,-1.19),scale(axis,1.33)], '#abc9ef74', .9);
    view.label(scale(axis,1.33), 'xyz'[i]);
  });
  const {model}=state;
  const points=model.sites.map(site=>transform(pose,site.position));
  if (settings.reference && state.progress>0 && state.progress<1 && op.kind!=='identity') {
    const fixed=model.sites.map(site=>transform(base,site.position));
    for (const [a,b] of state.modelEdges) view.path([fixed[a],fixed[b]],'#c0d8fc90',1,[4,4]);
    for (const point of fixed) view.point(point,'#c0d8fc70',3,false);
  }
  const depth = point=>view.project(point)[2];
  const faces=model.faces.map(({indices,kind},index)=>{
    const corners=indices.map(i=>points[i]);
    const center=faceCenter(corners);
    return {corners,center,kind,index};
  }).sort((a,b)=>depth(a.center)-depth(b.center));
  for (const {corners,kind} of faces) {
    const color=faceColors[kind];
    view.path(corners,color+(model.formula?'83':'e0'),1.25,[],color+(model.formula?'29':'c9'));
  }
  const items=[];
  for (const [a,b,order] of model.bonds) {
    const ends=[points[a],points[b]];
    items.push({depth:depth(faceCenter(ends)),draw:()=>{
      view.path(ends,'#263e5f',order===2?9:7);
      view.path(ends,'#adc5dd',order===2?5:3);
    }});
  }
  if (model.formula) {
    points.forEach((p,i)=>{
      const [color,size]=elementStyle[model.sites[i].kind];
      items.push({depth:depth(p),draw:()=>view.sphere(p,color,
        size*Math.max(.66,Math.min(1.65,state.camera.zoom))*(1+depth(p)*.11))});
    });
  }
  items.sort((a,b)=>a.depth-b.depth).forEach(item=>item.draw());
  if (settings.labels) {
    if (model.formula) {
      points.forEach((p,i)=>view.label(p,siteLabel(model.sites[i],i),'#fff1d0',[9,-9],'bold 11px system-ui'));
    } else {
      // Track one complete facet while keeping dense crystal forms readable.
      const tracked=faces.find(face=>face.index===0);
      view.path(tracked.corners,'#ffdb87',2,[],'#ffdb8733');
      view.label(tracked.center,'F1','#fff1ca',[5,-4],'bold 12px system-ui');
    }
  }
}

new ResizeObserver(drawHero).observe(document.querySelector('#hero-model'));
