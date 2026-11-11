'use strict';

(() => {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const groups = window.POINT_GROUPS;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
  const hm = value => escape(value).replace(/-(\d)/g,'<span class="overbar">$1</span>');
  const sf = value => escape(value).replace(/^([CDSTO])(.+)$/,'$1<sub>$2</sub>');
  const irrepName = value => escape(value).replace(/^([ABTE])([12gu]+)(.*)$/,'$1<sub>$2</sub>$3');
  const operationName = value => escape(value).replace(/([CS])(\d+)/g,'$1<sub>$2</sub>').replace(/σ([vhd])/g,'σ<sub>$1</sub>');
  const complexMultiply = ([a,b],[c,d]) => [a*c-b*d,a*d+b*c];
  const setText = (id, text) => { $(id).textContent = text; };
  const canvas = $('#scene');
  const cameraDefault = {yaw: .76, elevation: .40, zoom: 1};
  const state = {
    group: null, operation: 0, irrep: 0, start: 0, target: 0,
    progress: 1, playing: false, raf: 0, orbit: [], camera: {...cameraDefault}
  };

  function real(value) {
    if (Math.abs(value) < 1e-8) return '0';
    const exact = [[.5,'½'],[Math.sqrt(3)/2,'√3/2'],[Math.SQRT1_2,'1/√2']];
    const match = exact.find(([number]) => Math.abs(Math.abs(value)-number) < 1e-7);
    const text = match?.[1] ?? String(Number(Math.abs(value).toFixed(3)));
    return value < 0 ? '−'+text : text;
  }
  function complex([a,b]) {
    if (Math.abs(b)<1e-8) return real(a);
    const imag = Math.abs(Math.abs(b)-1)<1e-8 ? 'i' : real(Math.abs(b))+'i';
    if (Math.abs(a)<1e-8) return (b<0?'−':'')+imag;
    return real(a)+(b<0?' − ':' + ')+imag;
  }
  function matrixHTML(matrix, complexEntries = false) {
    const formatter = complexEntries ? complex : real;
    return '<table class="matrix" aria-label="矩阵"><tbody>'+matrix.map(row =>
      '<tr>'+row.map(value => {
        const text = formatter(value);
        return '<td'+(text==='0'?' class="matrix-zero"':'')+'>'+escape(text)+'</td>';
      }).join('')+'</tr>').join('')+'</tbody></table>';
  }

  const normalize = text => text.normalize('NFKC').toLowerCase()
    .replace(/([1-6])[\u0304\u0305]/g,'-$1').replace(/[−–]/g,'-').replace(/\s/g,'');
  function renderGroups() {
    const query = normalize($('#group-search').value);
    const system = $('#system-filter').value;
    const visible = groups.filter(group => (!system || system===group.system)
      && normalize([group.symbol,group.hm,group.system,group.symbol==='C3i'?'S6':''].join(' ')).includes(query));
    let previous = '';
    $('#group-list').innerHTML = visible.map(group => {
      const heading = previous===group.system ? '' : '<p class="system-heading">'+group.system+'晶系</p>';
      previous = group.system;
      const current = group === state.group;
      return heading+'<button type="button" class="group-option'+(current?' active':'')+'" data-group="'+group.symbol+
        '" aria-pressed="'+current+'"><strong class="math">'+sf(group.symbol)+'</strong><span class="math">'+hm(group.hm)+'</span><small>'+group.order+'</small></button>';
    }).join('') || '<p class="sidebar-note">没有匹配的点群。</p>';
    setText('#search-count', visible.length);
  }
  function draw() {
    const p = drawOrbit(canvas,state,{full:$('#full-orbit').checked,reference:$('#show-reference').checked});
    const complete = state.progress >= 1;
    const op = state.group.operations[complete ? state.target : state.operation];
    $('#pose-result').innerHTML = '<strong>'+(complete?'当前姿态':'演示中')+'</strong> · '+operationName(op.name)+
      (complete?' · det = '+op.det:'')+'　<span class="math">P = ('+p.map(real).join(', ')+')</span>';
    canvas.setAttribute('aria-label',state.group.symbol+' 对称操作 '+op.name+'。方向键旋转视角。');
    $('#scrub').value = state.progress;
    setText('#scrub-output',Math.round(state.progress*100)+'%');
  }
  function stop() {
    cancelAnimationFrame(state.raf);
    state.playing = false;
  }
  function updateControls() {
    setText('#play',state.playing?'暂停演示':state.progress<1?'继续演示':'重放本次');
    $$('[data-op],[data-class-op],[data-cayley-left]').forEach(button => { button.disabled = state.progress < 1; });
  }
  function play() {
    if (state.playing) { stop(); updateControls(); return; }
    if (state.progress === 1) state.progress = 0;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      state.progress = 1;
      draw();
      updateControls();
      return;
    }
    const start = performance.now(), offset = state.progress;
    state.playing = true;
    updateControls();
    function advance(now) {
      state.progress = Math.min(1, offset+(now-start)/970);
      draw();
      if (state.progress < 1) state.raf = requestAnimationFrame(advance);
      else { stop(); updateControls(); }
    }
    state.raf = requestAnimationFrame(advance);
  }
  function chooseOperation(index, fromIdentity = false) {
    if (state.progress < 1) return;
    stop();
    state.start = fromIdentity || $('#from-initial').checked ? 0 : state.target;
    state.operation = index;
    state.target = state.group.multiplication[index][state.start];
    state.progress = 0;
    updateOperation();
    renderIrrep();
    draw();
    play();
  }
  function resetPose() {
    stop();
    Object.assign(state,{operation:0,start:0,target:0,progress:1});
    updateOperation();
    renderIrrep();
    updateControls();
    draw();
  }
  function opDescription(op) {
    if (op.kind === 'identity') return '恒等操作，所有点保持原位。';
    if (op.kind === 'inversion') return '关于原点反演，三个坐标同时变号。';
    const direction = vector => '('+vector.map(real).join(', ')+')';
    if (op.kind === 'reflection') return '镜面法向 '+direction(op.normal)+'。法向分量反号。';
    const turn = '绕轴 '+direction(op.axis)+' 旋转 '+real(op.angle*180/Math.PI)+'°。';
    return op.kind==='improper' ? turn+'并关于垂直于该轴的平面反射。' : turn;
  }
  function updateOperation() {
    const g = state.group, op = g.operations[state.operation];
    $('#operation-name').innerHTML = operationName(op.name);
    setText('#operation-detail',opDescription(op)+' 生成元乘积 '+op.word+'。');
    setText('#operation-meta','行列式 '+op.det+' · 阶数 '+op.order+' · 类大小 '+g.classes[op.classId].size);
    $('#operation-matrix').innerHTML = matrixHTML(op.matrix);
    $('#operation-warning').hidden = op.det === 1;
    $$('[data-op]').forEach(button => {
      const selected = Number(button.dataset.op)===op.id;
      button.classList.toggle('active',selected);
      button.setAttribute('aria-pressed',selected);
    });
    $$('[data-class]').forEach(cell => cell.classList.toggle('active-class',Number(cell.dataset.class)===op.classId));
  }
  function renderIrrep() {
    const g = state.group, row = g.irreps[state.irrep], op = g.operations[state.operation];
    $('#irrep-title').innerHTML = '<span class="math">'+irrepName(row.label)+'</span> <span class="tag">维数 '+row.dimension+'</span>';
    setText('#irrep-meta','Frobenius–Schur 指标 '+(row.fs===0?'0 · 复型':'+1 · 实型')+'　χ(g) = '+row.characters[op.classId]);
    $('#irrep-matrix').innerHTML = matrixHTML(row.matrices[op.id], true);
    $('#basis-lists').innerHTML = [['polar','极矢量基'],['axial','轴矢量基'],['quadratic','对称二阶基']].map(([key,label]) =>
      '<p><strong>'+label+' · 重数 '+row[key]+'</strong>'+(row.basis[key].map(term=>'<code>'+escape(term)+'</code>').join('') || '<span class="muted">本空间中无对应基函数</span>')+'</p>').join('');
    $$('[data-irrep]').forEach(button => {
      const selected = Number(button.dataset.irrep)===state.irrep;
      button.setAttribute('aria-pressed',selected);
      button.closest('tr').classList.toggle('selected',selected);
    });
  }
  function operationButton(op, label, detail) {
    return '<button type="button" class="op-button" data-op="'+op.id+'">'+label+'<small>'+escape(detail)+'</small></button>';
  }
  function renderOperations() {
    const g = state.group;
    setText('#operation-count',g.order+' 个');
    $('#generator-buttons').innerHTML = g.generators.map(gen=>operationButton(g.operations[gen.index],
      escape(gen.letter)+' = '+operationName(gen.name),'阶数 '+gen.order)).join('') || '<span class="muted">空生成集</span>';
    $('#operations').innerHTML = g.classes.map(groupClass =>
      '<div class="operation-class"><p>'+operationName(groupClass.label)+' · '+groupClass.size+' 个</p><div class="op-items">'+
      groupClass.indices.map(index=>{
        const op = g.operations[index];
        return operationButton(op,operationName(op.name),op.word);
      }).join('')+'</div></div>').join('');
    setText('#generator-relations',(g.generators.map(gen=>gen.letter+'^'+gen.order+' = E').join(' · ') || '空生成集')+
      '。乘积闭包含 '+g.order+' 个元素。');
  }
  function characterTable(g, interactive) {
    const heading = g.classes.map(c => {
      const label = '<span class="math">'+operationName(c.label)+'</span>';
      return interactive
        ? '<th scope="col" data-class="'+c.id+'"><button type="button" data-class-op="'+c.representative+'">'+label+'<small>类大小 '+c.size+'</small></button></th>'
        : '<th scope="col">'+label+' <small>('+c.size+')</small></th>';
    }).join('');
    const rows = g.irreps.map((r,i) => {
      const label = irrepName(r.label);
      const name = interactive ? '<button type="button" class="math" data-irrep="'+i+'">'+label+'</button>' : '<span class="math">'+label+'</span>';
      return '<tr><td>'+name+(r.fs===0?'<span class="row-type">复型</span>':'')+'</td><td>'+r.dimension+'</td>'+
        r.characters.map((character,j)=>'<td class="math"'+(interactive?' data-class="'+j+'"':'')+'>'+escape(character)+'</td>').join('')+'</tr>';
    }).join('');
    return '<table class="data-table" aria-label="'+g.symbol+' 特征标表"><thead><tr><th scope="col">不可约表示</th><th scope="col">维数</th>'+heading+'</tr></thead><tbody>'+rows+'</tbody></table>';
  }
  function renderCayley() {
    const element = $('#cayley-table');
    if (!$('#cayley').open || element.dataset.group === state.group.symbol) return;
    const g = state.group;
    const header = g.operations.map(op=>'<th scope="col">'+escape(op.word)+'</th>').join('');
    const rows = g.multiplication.map((row,left)=>'<tr><th scope="row">'+escape(g.operations[left].word)+'</th>'+
      row.map((id,right)=>'<td><button type="button" data-cayley-left="'+left+'" data-cayley-right="'+right+'">'+escape(g.operations[id].word)+'</button></td>').join('')+'</tr>').join('');
    element.innerHTML = '<table class="data-table" aria-label="群乘法表"><thead><tr><th scope="col">左 × 右</th>'+header+'</tr></thead><tbody>'+rows+'</tbody></table>';
    element.dataset.group = g.symbol;
    element.classList.add('cayley-table');
    updateControls();
  }
  function decomposition(rows) {
    return rows.filter(([,multiplicity])=>multiplicity>0).map(([r,multiplicity])=>
      (multiplicity>1?multiplicity:'')+irrepName(r.label)).join(' ⊕ ') || '0';
  }
  function reduceCharacters(g, values) {
    return g.irreps.map(r => {
      const sum = r.values.reduce((total,z,j)=>total+g.classes[j].size*dot(z,values[j]),0);
      return [r,Math.round(sum/g.order)];
    });
  }
  function tensorProduct() {
    const g = state.group, a = g.irreps[$('#product-a').value], b = g.irreps[$('#product-b').value];
    const product = a.values.map((z,j)=>complexMultiply(z,b.values[j]));
    const rows = reduceCharacters(g,product);
    let html = '<div class="math">'+irrepName(a.label)+' ⊗ '+irrepName(b.label)+' = '+decomposition(rows)+'</div>';
    if (a===b) {
      const squareValues = g.classes.map(c => a.values[g.operations[g.multiplication[c.representative][c.representative]].classId]);
      for (const [title,sign] of [['Sym²',1],['Λ²',-1]]) {
        const values = product.map((z,j)=>scale(add(z,scale(squareValues[j],sign)),.5));
        html += '<div class="math">'+title+' '+irrepName(a.label)+' = '+decomposition(reduceCharacters(g,values))+'</div>';
      }
    }
    const invariant = rows.find(([r])=>r.values.every(([x,y])=>Math.abs(x-1)<1e-8 && Math.abs(y)<1e-8))[1];
    $('#product-result').innerHTML = html+'<small>全对称分量重数 '+invariant+'。实际耦合还取决于时间反演等约束。</small>';
  }
  function renderPhysics() {
    const g = state.group;
    for (const [id,key] of [['#polar-decomp','polar'],['#axial-decomp','axial'],['#quadratic-decomp','quadratic']]) {
      $(id).innerHTML = decomposition(g.irreps.map(r=>[r,r[key]]));
    }
    for (const [id,key] of [['#polar-dim','polarDimension'],['#rank2-dim','rank2Dimension'],['#piezo-dim','piezoDimension']]) setText(id,g[key]);
    const opts = g.irreps.map((r,i)=>'<option value="'+i+'">'+escape(r.label)+' · '+r.dimension+' 维</option>').join('');
    const firstDoublet = g.irreps.findIndex(r=>r.dimension===2);
    for (const id of ['#product-a','#product-b']) {
      $(id).innerHTML = opts;
      $(id).value = Math.max(0,firstDoublet);
    }
    tensorProduct();
  }
  function selectGroup(symbol) {
    const g = groups.find(group=>group.symbol===symbol);
    if (!g) return;
    const oldScroll = $('#group-list').scrollTop;
    stop();
    state.group = g;
    state.irrep = 0;
    state.orbit = g.operations.map(op=>seedPoints.map(point=>transform(op.matrix,point)));
    setText('#group-system',g.system+'晶系');
    $('#group-title').innerHTML = sf(g.symbol)+' <span class="hm-tag">'+hm(g.hm)+'</span>';
    setText('#group-description','群阶 '+g.order+' · '+g.classes.length+' 个共轭类 · '+g.irreps.length+' 个复不可约表示');
    $('#group-badges').innerHTML = [['有反演',g.centrosymmetric],['仅正旋转',g.chiral],['允许极性',g.polarDimension>0],['允许普通压电',g.piezoDimension>0]].map(([label,yes])=>
      '<span class="tag'+(yes?' yes':'')+'">'+label+' · '+(yes?'是':'否')+'</span>').join('');
    renderGroups();
    $('#group-list').scrollTop = oldScroll;
    renderOperations();
    $('#character-table').innerHTML = characterTable(g,true);
    setText('#group-specific-note','E 为恒等操作，ω = exp(2πi/3)。'+(g.irreps.some(r=>r.fs===0)
      ? '上标 ¹/² 区分复共轭伙伴，维数请读第二列。' : '本群的不可约表示均为实型。')+
      (g.symbol==='C3i'?' C₃ᵢ 的点群别名为 S₆。':'')+
      (g.symbol==='D3h'?' 本页 x 轴采用教学用正交设置。':''));
    setText('#cayley-result','');
    renderPhysics();
    resetPose();
    renderCayley();
  }
  function renderAppendix() {
    const rows = groups.map(g=>'<tr><td>'+g.number+'</td><td>'+g.system+'</td><td class="math">'+hm(g.hm)+'</td><td><button type="button" class="math" data-jump="'+g.symbol+'">'+sf(g.symbol)+'</button></td><td>'+g.order+'</td><td class="math>'+
      (g.generators.map(gen=>operationName(gen.name)).join(' · ') || '∅')+'</td></tr>').join('');
    $('#reference-index').innerHTML = '<table class="data-table" aria-label="晶体点群总表"><thead><tr><th>序号</th><th>晶系</th><th>国际符号</th><th>Schönflies</th><th>群阶</th><th>生成元</th></tr></thead><tbody>'+rows+'</tbody></table>';
    $('#reference-tables').innerHTML = groups.map(g=>'<details class="card"><summary><span class="math">'+sf(g.symbol)+' · '+hm(g.hm)+'</span><small>'+g.system+'晶系 · '+g.classes.length+' 个共轭类</small></summary><div class="table-scroll">'+characterTable(g,false)+'</div></details>').join('');
  }
  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content],{type}));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function downloadCSV() {
    const g = state.group;
    const rows = [
      ['irrep','dimension',...g.classes.map(c=>c.label)],
      ['class size','',...g.classes.map(c=>c.size)],
      ...g.irreps.map(r=>[r.label,r.dimension,...r.characters])
    ];
    const csv = rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');
    download(g.symbol+'-characters.csv','\ufeff'+csv,'text/csv;charset=utf-8');
  }
  function navigateToGroup(symbol, scroll) {
    selectGroup(symbol);
    try { history.replaceState(null,'','#group='+symbol); } catch { /* Local file remains fully interactive. */ }
    if (scroll) $('#explorer').scrollIntoView();
  }

  const quiz = [
    ['镜面反射的空间矩阵行列式是多少？',['+1','0','−1'],2,'镜面内两条方向不变，法向反号，因此行列式为 −1。'],
    ['C₃ᵥ 的 z 坐标属于哪个不可约表示？',['A₁','A₂','E'],0,'z 在三重旋转与三个垂直镜面下均保持不变。'],
    ['存在反演中心时，普通压电张量有多少个独立参数？',['0','3','取决于主轴阶数'],0,'普通压电张量在反演下变号，不变条件要求其各分量为零。'],
    ['在 C₃ 的复特征标表里，ω 和 ω̄ 对应的两个非平凡不可约表示各是几维？',['0 维','1 维','2 维'],1,'两个复共轭表示各为一维，在实表示中可合成一个二维块。']
  ];
  let quizIndex = 0;
  function renderQuiz() {
    const [question, choices] = quiz[quizIndex];
    setText('#quiz-question',(quizIndex+1)+' / '+quiz.length+'　'+question);
    setText('#quiz-feedback','');
    $('#quiz-options').innerHTML = choices.map((choice,i)=>'<button type="button" class="button subtle" data-answer="'+i+'">'+escape(choice)+'</button>').join('');
  }

  const systems = [...new Set(groups.map(g=>g.system))];
  $('#system-filter').insertAdjacentHTML('beforeend',systems.map(system=>'<option value="'+system+'">'+system+'晶系</option>').join(''));
  $('#group-search').addEventListener('input',renderGroups);
  $('#system-filter').addEventListener('change',renderGroups);
  $('#group-list').addEventListener('click',event=>{
    const button = event.target.closest('[data-group]');
    if (!button) return;
    navigateToGroup(button.dataset.group,false);
    $('#group-list [data-group="'+button.dataset.group+'"]').focus({preventScroll:true});
  });
  $('#reference-index').addEventListener('click',event=>{
    const button = event.target.closest('[data-jump]');
    if (button) navigateToGroup(button.dataset.jump,true);
  });
  for (const id of ['#operations','#generator-buttons']) $(id).addEventListener('click',event=>{
    const button = event.target.closest('[data-op]');
    if (button) chooseOperation(Number(button.dataset.op));
  });
  $('#character-table').addEventListener('click',event=>{
    const button = event.target.closest('button');
    if (!button) return;
    if ('classOp' in button.dataset) chooseOperation(Number(button.dataset.classOp));
    if ('irrep' in button.dataset) { state.irrep = Number(button.dataset.irrep); renderIrrep(); }
  });
  $('#cayley').addEventListener('toggle',renderCayley);
  $('#cayley-table').addEventListener('click',event=>{
    const button = event.target.closest('[data-cayley-left]');
    if (!button) return;
    const left = Number(button.dataset.cayleyLeft), right = Number(button.dataset.cayleyRight);
    const g = state.group, id = g.multiplication[left][right];
    setText('#cayley-result',g.operations[left].word+' × '+g.operations[right].word+' = '+g.operations[id].word+'　('+g.operations[id].name+')');
    chooseOperation(id,true);
  });
  $('#play').addEventListener('click',play);
  $('#reset').addEventListener('click',resetPose);
  $('#scrub').addEventListener('input',event=>{
    stop();
    state.progress = Number(event.target.value);
    updateControls();
    draw();
  });
  $('#top-view').addEventListener('click',()=>{ state.camera.yaw=0; state.camera.elevation=Math.PI/2; draw(); });
  $('#reset-camera').addEventListener('click',()=>{ state.camera={...cameraDefault}; draw(); });
  for (const id of ['#full-orbit','#show-reference']) $(id).addEventListener('change',draw);
  for (const id of ['#product-a','#product-b']) $(id).addEventListener('change',tensorProduct);
  $('#download-group').addEventListener('click',()=>download('point-group-'+state.group.symbol+'.json',JSON.stringify(state.group,null,2),'application/json'));
  $('#download-csv').addEventListener('click',downloadCSV);
  $('#quiz-options').addEventListener('click',event=>{
    const button = event.target.closest('[data-answer]');
    if (!button) return;
    const correct = Number(button.dataset.answer)===quiz[quizIndex][2];
    $$('#quiz-options button').forEach(choice=>choice.classList.remove('correct','incorrect'));
    button.classList.add(correct?'correct':'incorrect');
    setText('#quiz-feedback',(correct?'正确。':'再试一次。')+quiz[quizIndex][3]);
  });
  $('#quiz-next').addEventListener('click',()=>{ quizIndex=(quizIndex+1)%quiz.length; renderQuiz(); });
  const clampElevation = value => Math.min(Math.PI/2,Math.max(-Math.PI/2,value));
  let pointer = null;
  canvas.addEventListener('pointerdown',event=>{
    pointer = [event.clientX,event.clientY];
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove',event=>{
    if (!pointer) return;
    state.camera.yaw -= (event.clientX-pointer[0])*.009;
    state.camera.elevation = clampElevation(state.camera.elevation+(event.clientY-pointer[1])*.009);
    pointer = [event.clientX,event.clientY];
    draw();
  });
  for (const event of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(event,()=>{ pointer=null; });
  canvas.addEventListener('wheel',event=>{
    event.preventDefault();
    state.camera.zoom = Math.min(1.8,Math.max(.55,state.camera.zoom*Math.exp(-event.deltaY*.001)));
    draw();
  },{passive:false});
  canvas.addEventListener('keydown',event=>{
    const keys = {ArrowLeft:[.12,0],ArrowRight:[-.12,0],ArrowUp:[0,.12],ArrowDown:[0,-.12]};
    if (!keys[event.key]) return;
    event.preventDefault();
    state.camera.yaw += keys[event.key][0];
    state.camera.elevation = clampElevation(state.camera.elevation+keys[event.key][1]);
    draw();
  });
  setText('#source-code',operationPath.toString()+'\n\n'+axisRotation.toString());
  selectGroup(groups.some(g=>'#group='+g.symbol===location.hash)?location.hash.slice(7):'C3v');
  $('#group-list .active')?.scrollIntoView({block:'nearest',container:'nearest'});
  renderAppendix();
  renderQuiz();
  new ResizeObserver(draw).observe(canvas);
  let printState = [];
  window.addEventListener('beforeprint',()=>{
    printState = $$('#reference-tables details').map(details=>[details,details.open]);
    printState.forEach(([details])=>{ details.open=true; });
  });
  window.addEventListener('afterprint',()=>printState.forEach(([details,open])=>{ details.open=open; }));
})();
