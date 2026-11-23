'use strict';

const distance = (a,b) => Math.hypot(...a.map((value,i)=>value-b[i]));
const unit = v => scale(v,1/Math.hypot(...v));
const polar = (r,a,z=0) => [r*Math.cos(a),r*Math.sin(a),z];
const polygon = (n,r,z=0,angle=0) => Array.from({length:n},(_,i)=>polar(r,angle+2*Math.PI*i/n,z));
const origin = [0,0,0];
const tetrahedron = [[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]];
const atom = (kind,position) => ({kind,position});
const star = (count) => Array.from({length:count},(_,i)=>[0,i+1]);
const tetraFaces = [[1,2,3],[1,2,4],[1,3,4],[2,3,4]];
const chemistrySource = 'https://cccbdb.nist.gov/pglistx.asp';
const crystalSource = 'https://onlinelibrary.wiley.com/iucr/itc/Ac/ch3o2v0001/';

function molecule(name,formula,description,sites,bonds,faces=[]) {
  return {
    name,formula,description,category:'理想化分子',source:chemistrySource,
    sites,bonds,faces:faces.map(indices=>({indices,kind:'配位面'}))
  };
}

function alkene(terminal) {
  const substituted = terminal==='Cl';
  const right = substituted ? [[.83,.76,0],[.91,-.68,0]] : [[.85,.71,0],[.85,-.71,0]];
  const left = right.map(p=>scale(p,-1));
  return molecule(substituted?'反式 1,2-二氯乙烯':'乙烯',substituted?'C₂H₂Cl₂':'C₂H₄',
    substituted?'两个 Cl 位于 C=C 的相对两侧。反演交换两个 Cl，分子平面内的各原子在镜映下原地不动。':
      '分子位于 xy 平面，C=C 沿 x 轴。绕垂直于分子平面的二重轴转动会交换两个端基。',
    [atom('C',[-.40,0,0]),atom('C',[.40,0,0]),...right.map((p,i)=>atom(i===0?terminal:'H',p)),
      ...left.map((p,i)=>atom(i===0?terminal:'H',substituted?p:[-right[i][0],right[i][1],0]))],
    [[0,1,2],[1,2],[1,3],[0,4],[0,5]]);
}

const moleculeModels = {
  C1: () => molecule('溴氯氟甲烷','CHBrClF','四面体碳连接四种不同的原子。任意交换顶点都会改变元素的分布。',
    [atom('C',origin),...['H','F','Cl','Br'].map((kind,i)=>atom(kind,scale(unit(tetrahedron[i]),[.74,.91,1.08,1.19][i])))],
    star(4),tetraFaces),
  Ci: () => {
    const half = [[.42,0,0],[.77,.5,.46],[.77,.19,-.76],[.85,-.70,.12]];
    const kinds = ['C','H','F','Cl'];
    return molecule('1,2-二氯-1,2-二氟乙烷','C₂H₂Cl₂F₂','取具有反演中心的构象。每种末端原子在另一侧都有一个关于 C–C 中点对称的同类原子。',
      [...half.map((p,i)=>atom(kinds[i],p)),...half.map((p,i)=>atom(kinds[i],scale(p,-1)))],
      [[0,4],...[1,2,3].flatMap(i=>[[0,i],[4,i+4]])]);
  },
  C2: () => molecule('过氧化氢','H₂O₂','采用非平面的扭转构象。绕 z 轴转动 180°，两侧的 O–H 键互换。',
    [atom('O',[.50,0,0]),atom('O',[-.50,0,0]),atom('H',[.74,.63,.33]),atom('H',[-.74,-.63,.33])],
    [[0,1],[0,2],[1,3]]),
  Cs: () => molecule('次氯酸','HOCl','弯曲的 H–O–Cl 骨架位于 xy 镜面，镜映时三个原子各自保持原位。',
    [atom('O',origin),atom('H',[-.28,.72,0]),atom('Cl',[1.04,-.10,0])],star(2)),
  C2h: () => alkene('Cl'),
  C2v: () => molecule('水','H₂O','两个 O–H 键围成约 104.5°。绕 z 轴转动 180° 交换两个 H。',
    [atom('O',[0,0,.39]),...[-1,1].map(sign=>atom('H',[sign*.79,0,-.22]))],star(2)),
  D2h: () => alkene('H'),
  C4v: () => molecule('五氟化溴','BrF₅','四个基底 F 和沿 +z 的轴向 F 构成方锥。绕 z 轴四分之一转会轮换基底 F。',
    [atom('Br',origin),...polygon(4,1,-.12).map(p=>atom('F',p)),atom('F',[0,0,1.02])],
    star(5),[[1,2,3,4],[1,2,5],[2,3,5],[3,4,5],[4,1,5]]),
  D2d: () => molecule('丙二烯','H₂C=C=CH₂','两端 CH₂ 平面互相垂直。绕 C=C=C 骨架旋转 90° 再关于 xy 面镜映，两端互换。',
    [atom('C',origin),atom('C',[0,0,.58]),atom('C',[0,0,-.58]),
      ...polygon(2,.58,.99,Math.PI/4).map(p=>atom('H',p)),...polygon(2,.58,-.99,3*Math.PI/4).map(p=>atom('H',p))],
    [[0,1,2],[0,2,2],[1,3],[1,4],[2,5],[2,6]]),
  D4h: () => molecule('四氟化氙','XeF₄','四个 F 在 xy 平面形成正方形，Xe 位于中心。可比较绕 z 的四重旋转与分子平面的镜映。',
    [atom('Xe',origin),...polygon(4,1).map(p=>atom('F',p))],star(4),[[1,2,3,4]]),
  C3v: () => molecule('氨','NH₃','三个 H 构成三角形底面，N 位于其上方。沿 z 轴转动 120° 会轮换三个 H。',
    [atom('N',[0,0,.46]),...polygon(3,.91,-.23).map(p=>atom('H',p))],star(3),tetraFaces.map(face=>face.map(i=>i-1))),
  D3d: () => molecule('交错式乙烷','C₂H₆','沿 C–C 轴看，两组 C–H 键相错 60°。反演通过 C–C 中点交换两个甲基。',
    [atom('C',[0,0,.36]),atom('C',[0,0,-.36]),...polygon(3,.72,.80,Math.PI/6).map(p=>atom('H',p)),
      ...polygon(3,.72,.80,Math.PI/6).map(p=>atom('H',scale(p,-1)))],
    [[0,1],...[0,1,2].flatMap(i=>[[0,i+2],[1,i+5]])]),
  C3h: () => molecule('硼酸','B(OH)₃','采用平面构型，三个 O–H 键同向偏转，保留水平镜面和三重旋转。',
    [atom('B',origin),...polygon(3,.72).map(p=>atom('O',p)),...polygon(3,1.01,0,.49).map(p=>atom('H',p))],
    [...star(3),[1,4],[2,5],[3,6]]),
  D3h: () => molecule('三氟化硼','BF₃','三个 F 组成平面等边三角形。分子平面是水平镜面，经过 B–F 键的面内轴是二重旋转轴。',
    [atom('B',origin),...polygon(3,1).map(p=>atom('F',p))],star(3),[[1,2,3]]),
  D6h: () => molecule('苯','C₆H₆','六个 C 组成平面六元环，H 位于外侧。绕环法线转动 60°，每个 C 和 H 都移至同类位点。',
    [...polygon(6,.72).map(p=>atom('C',p)),...polygon(6,1.15).map(p=>atom('H',p))],
    Array.from({length:6},(_,i)=>[[i,(i+1)%6],[i,i+6]]).flat(),[[0,1,2,3,4,5]]),
  Td: () => molecule('甲烷','CH₄','四个 H 位于正四面体顶点，C 在中心。沿一根 C–H 键转动 120° 时，另外三个 H 轮换。',
    [atom('C',origin),...tetrahedron.map(p=>atom('H',scale(unit(p),1.12)))],star(4),tetraFaces),
  Oh: () => molecule('六氟化硫','SF₆','六个 F 位于正八面体顶点，沿 ±x、±y、±z 分布。正八面体和正方体的点群均为 Oₕ。',
    [atom('S',origin),...identity.flatMap(axis=>[atom('F',scale(axis,1.11)),atom('F',scale(axis,-1.11))])],
    star(6),[1,2].flatMap(i=>[3,4].flatMap(j=>[5,6].map(k=>[i,j,k]))))
};

// Each plane is a physical facet. All planes are tangent to the same sphere,
// so each distinct normal contributes a face to the finished symmetric solid.
function facetSolid(group, families, name, description) {
  const planes = [];
  for (const [kind,normals] of families) {
    for (const normal of normals) {
      for (const {matrix} of group.operations) {
        const n = unit(transform(matrix,normal));
        if (!planes.some(plane=>distance(plane.n,n)<1e-7)) planes.push({n,kind});
      }
    }
  }
  const vertices = [];
  const faceIndices = planes.map(()=>[]);
  for (let i=0; i<planes.length-2; i++) {
    for (let j=i+1; j<planes.length-1; j++) {
      for (let k=j+1; k<planes.length; k++) {
        const a=planes[i].n,b=planes[j].n,c=planes[k].n;
        const det=dot(a,cross(b,c));
        if (Math.abs(det)<1e-8) continue;
        const p=scale(add(add(cross(b,c),cross(c,a)),cross(a,b)),1/det);
        if (planes.some(plane=>dot(plane.n,p)>1+1e-8)) continue;
        let index=vertices.findIndex(v=>distance(v,p)<1e-7);
        if (index===-1) { index=vertices.length; vertices.push(p); }
        for (const face of [i,j,k]) {
          if (!faceIndices[face].includes(index)) faceIndices[face].push(index);
        }
      }
    }
  }
  const faces=planes.map(({n,kind},i)=>{
    const indices=faceIndices[i];
    const x=unit(cross(n,Math.abs(n[2])<.9?[0,0,1]:[0,1,0])), y=cross(n,x);
    indices.sort((p,q)=>Math.atan2(dot(vertices[p],y),dot(vertices[p],x))-Math.atan2(dot(vertices[q],y),dot(vertices[q],x)));
    return {indices,kind};
  });
  const zoom=1.24/Math.max(...vertices.map(v=>Math.hypot(...v)));
  return {name,description,formula:'',category:'理想化晶形',source:crystalSource,
    planes,faces,bonds:[],sites:vertices.map(v=>atom('顶点',scale(v,zoom)))};
}

const crystalModels = {
  D2: ['正交斜方楔形组合体','沿三个互相垂直方向各有一根二重轴。沿轴转动半圈可比较不同面族的互换。'],
  C4: ['四方同向斜切柱','斜面绕 z 轴按同一方向重复，构成四重旋转的晶面排列。'],
  S4: ['四方四角反转晶形','四个斜向面在上下两侧交替出现。绕 z 轴转动四分之一圈再镜映，可复原相同面族。'],
  C4h: ['四方有底面斜切柱','四重轴垂直于顶、底面。反演配对上下两侧的对应面。'],
  D4: ['四方旋转斜面组合体','除竖直的四重轴外，还有横向二重轴。沿横轴转动半圈会把上侧晶面移到下侧。'],
  C3: ['三方同向斜切柱','三个斜面沿 z 轴按 120° 重复，展示三方晶形中的三重轴。'],
  C3i: ['三方反演斜面组合体','两端各有三组彼此反演的面。选取反演可观察晶面从一端对应到另一端。'],
  D3: ['三方旋转斜面组合体','z 轴是三重轴，面内的三根二重轴使两端对应。常温 α-石英属于这一点群。'],
  C6: ['六方同向斜切柱','同向的斜面按 60° 重复，保留 z 轴的六重旋转。'],
  C6h: ['六方有底面斜切柱','六重轴穿过两端，水平镜映对应同一方位的上下晶面。'],
  D6: ['六方旋转斜面组合体','z 轴六重旋转和六条面内二重轴共同决定上下两侧的面族排列。高温 β-石英属于这一点群。'],
  C6v: ['六方锥','六个相同侧面围绕六重轴，轴穿过锥尖和底面中心。六个垂直镜面贯穿锥体。'],
  T: ['四面体旋转晶形','四面体方向成组出现。三重轴沿体对角线，二重轴沿笛卡尔坐标轴。'],
  Th: ['黄铁矿式五角十二面体','十二个面为不规则五边形。沿立方体体对角线有三重旋转，原点是反演中心。'],
  O: ['立方旋转斜切晶形','六个近似方形的轴向区域由带有手性的斜面环绕。可沿面法向四重旋转，或沿体对角线三重旋转。']
};

const modelsByGroup = new Map();
const modelNames = Object.fromEntries([
  ...Object.entries(crystalModels).map(([symbol,[name]])=>[symbol,name]),
  ...Object.entries(moleculeModels).map(([symbol,build])=>{
    const {name,formula}=build();
    return [symbol,name+' '+formula];
  })
]);

function modelFor(group) {
  if (modelsByGroup.has(group.symbol)) return modelsByGroup.get(group.symbol);
  const moleculeBuilder=moleculeModels[group.symbol];
  let model;
  if (moleculeBuilder) {
    model=moleculeBuilder();
  } else {
    const closedAxes=identity.flatMap(axis=>[axis,scale(axis,-1)]);
    const families=[['轴向面',closedAxes],['斜面Ⅰ',[[.34,.61,.72]]],['斜面Ⅱ',[[.79,-.43,.39]]]];
    const [name,description]=crystalModels[group.symbol];
    const special={
      Th:[['五边形晶面',[[1,.5,0]]]],
      C6v:[['底面',[[0,0,-1]]],['锥面',[[1,0,.47]]]]
    };
    model=facetSolid(group,special[group.symbol]??families,name,description.trim());
    if (['D3','D6'].includes(group.symbol)) model.source='https://journals.iucr.org/j/issues/2022/04/00/te5094/';
    if (group.symbol==='Th') model.source='https://www.iucr.org/who-we-are/commissions/commission-on-crystallographic-nomenclature/published-reports/inorganic';
  }
  modelsByGroup.set(group.symbol,model);
  return model;
}
