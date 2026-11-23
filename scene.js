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
    const rightBound=width-ctx.measureText(text).width-4;
    ctx.fillText(text,Math.max(4,Math.min(rightBound,x+offset[0])),Math.max(14,Math.min(height-5,y+offset[1])));
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
function faceCenter(points) {
  return scale(points.reduce(add,[0,0,0]),1/points.length);
}

function modelEdges(model) {
  const edges = new Map();
  for (const {indices} of model.faces??[]) {
    indices.forEach((a,i)=>{
      const b=indices[(i+1)%indices.length];
      edges.set(Math.min(a,b)+':'+Math.max(a,b),[a,b]);
    });
  }
  for (const [a,b] of model.bonds) edges.set(Math.min(a,b)+':'+Math.max(a,b),[a,b]);
  return [...edges.values()];
}

function siteLabel(site,index) {
  return site.kind.startsWith('顶点') ? 'V'+(index+1) : site.kind+(index+1);
}

function siteTrajectory(op,start,progress) {
  const segments=Math.max(1,Math.ceil(64*progress));
  const times=Array.from({length:segments+1},(_,i)=>progress*i/segments);
  // Include the junction between rotation and reflection exactly.
  if (op.kind==='improper' && progress>.55) {
    times.splice(times.findIndex(t=>t>.55),0,.55);
  }
  return times.map(t=>transform(operationPath(op,t),start));
}

function drawTrajectory(view,op,start,point,label,progress) {
  const gold='#ffdc85';
  const destination=transform(op.matrix,start);
  if (distance(destination,start)>1e-7) {
    if (progress<1) {
      view.path(siteTrajectory(op,start,1),'#ffd9949c',1.7,[5,5]);
      view.point(destination,'#ffd994aa',4,false);
    }
    if (progress>0) {
      const trail=siteTrajectory(op,start,progress);
      view.path(trail,'#0b1d35',6);
      view.path(trail,gold,2.8);
    }
    view.point(start,gold,5,false);
    view.label(start,'起点','#ffedbe',[-22,17],'11px system-ui');
  }
  view.point(point,gold,6,false);
  view.point(point,gold,3,true,true);
  view.label(point,label,'#ffedbe',[10,-12],'bold 12px system-ui');
}

function drawStructure(canvas, state, settings) {
  const view = canvasView(canvas, state.camera, .32, [.5,.47]);
  const op = state.group.operations[state.operation];
  const base = state.group.operations[state.start].matrix;
  const pose = multiply(operationPath(op,state.progress),base);
  const guide=state.previewOperation??op;
  drawGrid(view, 1.44, -1.24, .36, '#6c97c520');
  if (guide.normal) {
    const normal = guide.normal;
    const raw = cross(normal, Math.abs(normal[2]) < .85 ? [0,0,1] : [1,0,0]);
    const u = scale(raw, 1/Math.hypot(...raw)), v = cross(normal, u);
    const disk = ring(1.22, 0).map(([x,y]) => add(scale(u,x), scale(v,y)));
    view.path(disk, '#8dcbffab', 1.3, [5,4]);
    view.label(disk[8],'镜面','#bfe5ff');
  }
  identity.forEach((axis, i) => {
    view.path([scale(axis,-1.19),scale(axis,1.33)], '#abc9ef74', .9);
    view.label(scale(axis,1.33), 'xyz'[i]);
  });
  const {model}=state;
  const points=model.sites.map(site=>transform(pose,site.position));
  if (settings.reference && state.progress>0 && state.progress<1 && op.kind!=='identity') {
    const fixed=model.sites.map(site=>transform(base,site.position));
    for (const [a,b] of model.bonds) view.path([fixed[a],fixed[b]],'#c0d8fc90',1,[4,4]);
    for (const point of fixed) view.point(point,'#c0d8fc70',3,false);
  }
  const depth = point=>view.project(point)[2];
  const items=[];
  for (const [a,b,order] of model.bonds) {
    const ends=[points[a],points[b]];
    items.push({depth:depth(faceCenter(ends)),draw:()=>{
      view.path(ends,'#263e5f',order===2?9:7);
      view.path(ends,'#adc5dd',order===2?5:3);
    }});
  }
  points.forEach((p,i)=>{
    const kind=model.sites[i].kind;
    const [color,size]=elementStyle[kind]??[kind==='顶点B'?'#98d9cc':'#93bfff',model.sites.length>12?7:9];
    items.push({depth:depth(p),draw:()=>view.sphere(p,color,
      size*Math.max(.66,Math.min(1.65,state.camera.zoom))*(1+depth(p)*.11))});
  });
  items.sort((a,b)=>a.depth-b.depth).forEach(item=>item.draw());
  if (guide.kind==='rotation'||guide.kind==='improper') {
    const tip=scale(guide.axis,1.42);
    view.path([scale(guide.axis,-1.38),tip],'#10243e',4,[6,4]);
    view.path([scale(guide.axis,-1.38),tip],'#88e5ff',1.9,[6,4]);
    const [tipX,tipY]=view.project(tip);
    const [centerX,centerY]=view.project([0,0,0]);
    if (Math.hypot(tipX-centerX,tipY-centerY)<3) {
      view.point([0,0,0],'#88e5ff',5,false);
    }
    view.label(tip,'旋转轴','#a6eeff',[13,11]);
  }
  if (guide.kind==='inversion') {
    view.point([0,0,0],'#88e5ff',5,false);
    view.label([0,0,0],'反演中心','#a6eeff',[9,15]);
  }
  if (settings.labels) {
    points.forEach((p,i)=>{
      if (i!==state.trackedSite) view.label(p,siteLabel(model.sites[i],i),'#e0efff',[9,-9],'bold 11px system-ui');
    });
  }
  if (state.trackedSite!==null) {
    const index=state.trackedSite, site=model.sites[index];
    drawTrajectory(view,guide,transform(base,site.position),points[index],siteLabel(site,index),state.previewOperation?0:state.progress);
  }
  return points.map(view.project);
}

new ResizeObserver(drawHero).observe(document.querySelector('#hero-model'));
