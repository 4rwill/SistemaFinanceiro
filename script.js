// --- CONFIGURAÇÃO E DADOS ---
const DB_KEY = 'SIP_FINANCE_V3';
const MONTHS = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DEFAULT_CATEGORIES = [
    { name: 'Alimentação', icon: 'fa-utensils' },
    { name: 'Moradia', icon: 'fa-home' },
    { name: 'Transporte', icon: 'fa-car' },
    { name: 'Lazer', icon: 'fa-gamepad' },
    { name: 'Saúde', icon: 'fa-heartbeat' },
    { name: 'Educação', icon: 'fa-graduation-cap' },
    { name: 'Compras', icon: 'fa-shopping-bag' },
    { name: 'Serviços', icon: 'fa-tools' },
    { name: 'Viagem', icon: 'fa-plane' }
];

// Estado Visual (Filtros e Ordenação)
let viewState = {
    filter: 'all',
    sortCol: 'date',
    sortAsc: true
};

// Variáveis Globais de Controle dos Modais
let currentTransId = null;
let currentTransType = null;
let currentGoalId = null;
let selectedGoalIcon = 'fa-bullseye';
let originalDesc = null;

// Estrutura Inicial do Banco de Dados
let db = {
    months: {},
    goals: [] 
};

// Inicializa meses vazios na memória
MONTHS.forEach(m => { db.months[m] = { fixed: [], variable: [], income: [] }; });

// --- INICIALIZAÇÃO ---
window.onload = function() {
    loadData();

    const hoje = new Date();
    const indiceMes = hoje.getMonth();
    const nomeMes = MONTHS[indiceMes]; // Ex: "fevereiro"
    
    // 1. Seleciona o mês correto no dropdown
    const select = document.getElementById('month-select');
    if(select) select.value = nomeMes;

    // 2. Muda o texto do Menu Lateral para "Gestão de Fevereiro"
    const labelMenu = document.getElementById('sidebar-month-label');
    if(labelMenu) {
        // Deixa a primeira letra maiúscula para ficar bonito
        const mesCapitalizado = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1);
        labelMenu.innerText = `Gestão de ${mesCapitalizado}`;
    }
    // ---------------------------------------

    // Verifica em qual tela estamos para renderizar o conteúdo certo
    if(document.getElementById('view-dashboard').classList.contains('active')) {
        renderDashboard();
    } else if(document.getElementById('view-monthly').classList.contains('active')) {
        renderMonthly(); // Vai renderizar o mês que acabamos de selecionar acima
    } else {
        renderGoals();
    }
};

// --- GERENCIAMENTO DE DADOS ---
function loadData() {
    const saved = localStorage.getItem(DB_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            db = { ...db, ...parsed };
            // Garante integridade se faltar algum mês no JSON antigo
            MONTHS.forEach(m => {
                if(!db.months[m]) db.months[m] = { fixed: [], variable: [], income: [] };
            });
        } catch(e) { console.error("Erro ao carregar dados", e); }
    } else {
        saveData();
    }
}

function saveData() {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
    showToast();
    updateCalculations();
}

function showToast() {
    const t = document.getElementById('toast');
    if(t) {
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 2000);
    }
}

function resetSystem() {
    if(confirm("CUIDADO: Isso apagará TODOS os dados permanentemente. Continuar?")) {
        localStorage.removeItem(DB_KEY);
        db = { months: {}, goals: [] }; // Zera memória
        MONTHS.forEach(m => { db.months[m] = { fixed: [], variable: [], income: [] }; });
        location.reload();
    }
}

// --- NAVEGAÇÃO ---
function switchView(viewId, btn) {
    // Atualiza Menu Lateral
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.mobile-item').forEach(el => el.classList.remove('active'));
    if(btn) btn.classList.add('active');
    
    // Atualiza Seções
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${viewId}`).classList.add('active');

    // Lógica de Header
    const title = document.getElementById('page-title');
    const selector = document.getElementById('month-control');

    if(viewId === 'monthly') {
        title.innerHTML = 'GESTÃO DE <span id="month-name-display">...</span>';
        selector.style.display = 'block';
        renderMonthly();
    } else if (viewId === 'dashboard') {
        title.innerText = "VISÃO GERAL";
        selector.style.display = 'none';
        renderDashboard();
    } else {
        title.innerText = "METAS & SONHOS";
        selector.style.display = 'none';
        renderGoals();
    }
}

// --- IMPORTAR / EXPORTAR ---
function exportData() {
    const dataStr = JSON.stringify(db, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sip_finance_backup_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function triggerImport() { document.getElementById('import-file').click(); }

function handleImport(input) {
    const file = input.files[0];
    if (!file) return;
    if (!confirm("Isso substituirá TODOS os seus dados atuais. Continuar?")) {
        input.value = ''; return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parsed = JSON.parse(e.target.result);
            if (!parsed.months) throw new Error("Arquivo inválido");
            db = parsed;
            localStorage.setItem(DB_KEY, JSON.stringify(db));
            alert("Importação realizada com sucesso!");
            location.reload();
        } catch (err) { alert("Erro ao importar arquivo."); }
    };
    reader.readAsText(file);
}

// --- FILTROS E ORDENAÇÃO ---
function applyFilter(cat) {
    viewState.filter = cat;
    const m = document.getElementById('month-select').value;
    renderTableRows(m, 'variable');
}

function applySort(col) {
    if (viewState.sortCol === col) {
        viewState.sortAsc = !viewState.sortAsc;
    } else {
        viewState.sortCol = col;
        viewState.sortAsc = true;
    }
    updateSortIcons(col, viewState.sortAsc);
    const m = document.getElementById('month-select').value;
    renderTableRows(m, 'variable');
}

function updateSortIcons(activeCol, isAsc) {
    document.querySelectorAll('.sort-icon').forEach(icon => {
        icon.className = 'fas fa-sort sort-icon';
        icon.style.opacity = '0.3';
    });
    // Mapeamento simples de colunas da tabela variável
    // 0=Data, 1=Desc, 2=Cat, 3=Val
    const colMap = { 'date': 0, 'desc': 1, 'cat': 2, 'val': 3 };
    const ths = document.querySelectorAll('#table-variable th');
    if(ths[colMap[activeCol]]) {
        const icon = ths[colMap[activeCol]].querySelector('.sort-icon');
        if(icon) {
            icon.className = isAsc ? 'fas fa-sort-up sort-icon' : 'fas fa-sort-down sort-icon';
            icon.style.opacity = '1';
            icon.style.color = 'var(--primary)';
        }
    }
}

// --- RENDERIZADORES ---
function formatBRL(val) {
    return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function renderDashboard() {
    let totalInc = 0, totalExp = 0;
    let labels = [], dInc = [], dExp = [];

    MONTHS.forEach(m => {
        const d = db.months[m];
        const inc = d.income.reduce((a,b) => a + Number(b.val), 0);
        const exp = d.fixed.reduce((a,b) => a + Number(b.val), 0) + d.variable.reduce((a,b) => a + Number(b.val), 0);
        
        totalInc += inc;
        totalExp += exp;
        labels.push(m.substr(0,3).toUpperCase());
        dInc.push(inc);
        dExp.push(exp);
    });

    document.getElementById('kpi-total-inc').innerText = formatBRL(totalInc);
    document.getElementById('kpi-total-exp').innerText = formatBRL(totalExp);
    
    const balance = totalInc - totalExp;
    document.getElementById('kpi-total-balance').innerText = formatBRL(balance);
    
    const rate = totalInc > 0 ? (balance / totalInc * 100).toFixed(1) : 0;
    document.getElementById('kpi-rate').innerHTML = `
        ${rate}%
        <div style="font-size: 0.8rem; font-weight: 400; color: var(--text-muted); margin-top: 5px;">
            ${formatBRL(balance)}
        </div>
    `;

    // Gráfico Principal
    const ctx = document.getElementById('mainChart').getContext('2d');
    if(window.mainChartInst) window.mainChartInst.destroy();
    
    let gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(251, 191, 36, 0.4)');
    gradient.addColorStop(1, 'rgba(251, 191, 36, 0.0)');

    window.mainChartInst = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Saldo',
                data: dInc.map((v, i) => v - dExp[i]),
                borderColor: '#fbbf24',
                backgroundColor: gradient,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { grid: { color:'rgba(255,255,255,0.05)' } }, x: { display:false } }
        }
    });
}

function renderMonthly() {
    const m = document.getElementById('month-select').value;
    document.getElementById('month-name-display').innerText = m.toUpperCase();
    
    updateCategoryDropdown(m);
    renderTableRows(m, 'fixed');
    renderTableRows(m, 'variable');
    renderTableRows(m, 'income');
    
    updateCalculations();
}

function updateCategoryDropdown(month) {
    const list = db.months[month].variable;
    const cats = new Set(['all']);
    list.forEach(item => { if(item.cat) cats.add(item.cat); });
    
    const select = document.getElementById('filter-category');
    // Salva seleção atual ou reseta
    const currentSelection = viewState.filter;
    
    select.innerHTML = '';
    
    // Opção Padrão
    const optAll = document.createElement('option');
    optAll.value = 'all'; optAll.innerText = 'Todas Categorias';
    select.appendChild(optAll);

    cats.forEach(c => {
        if(c !== 'all') {
            const opt = document.createElement('option');
            opt.value = c; opt.innerText = c;
            select.appendChild(opt);
        }
    });

    if(cats.has(currentSelection)) select.value = currentSelection;
    else { select.value = 'all'; viewState.filter = 'all'; }
}

function renderTableRows(month, type) {
    const originalList = db.months[month][type];
    let tbody;

    if(type === 'fixed') {
        tbody = document.getElementById('tbody-fixed');
        tbody.innerHTML = '';
        originalList.forEach((item, idx) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="status-badge ${item.paid ? 'status-paid' : 'status-pending'}" onclick="toggleStatus('${month}', ${idx})">
                        <i class="fas ${item.paid ? 'fa-check' : 'fa-clock'}"></i> ${item.paid ? 'PAGO' : 'PEND'}
                    </div>
                </td>
                <td>${item.desc}</td>
                <td>${formatBRL(item.val)}</td>
                <td>
                    <div style="display:flex; gap:10px;">
                        <button class="btn-icon" onclick="openTransactionModal('fixed', ${item.id})"><i class="fas fa-pencil-alt"></i></button>
                        <button class="btn-icon" style="color:#ef4444" onclick="delRow('${month}', 'fixed', ${idx})"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } 
    else if(type === 'variable') {
        tbody = document.getElementById('tbody-variable');
        tbody.innerHTML = '';
        
        let displayList = originalList.map((item, index) => ({ ...item, originalIndex: index }));
        
        // Filtro
        if (viewState.filter !== 'all') {
            displayList = displayList.filter(item => item.cat === viewState.filter);
        }
        
        // Ordenação
        displayList.sort((a, b) => {
            let valA = a[viewState.sortCol];
            let valB = b[viewState.sortCol];
            
            if (viewState.sortCol === 'val') { 
                valA = Number(valA); 
                valB = Number(valB); 
            } else { 
                valA = (valA||'').toString().toLowerCase(); 
                valB = (valB||'').toString().toLowerCase(); 
            }
            
            if (valA < valB) return viewState.sortAsc ? -1 : 1;
            if (valA > valB) return viewState.sortAsc ? 1 : -1;
            return 0;
        });

        displayList.forEach((item) => {
            const dateDisplay = item.date ? new Date(item.date).toLocaleDateString('pt-BR', {timeZone:'UTC'}) : '-';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${dateDisplay}</td>
                <td>${item.desc}</td>
                <td><span class="status-badge status-pending" style="background:rgba(251, 191, 36, 0.1); color:var(--primary)">${item.cat || 'Geral'}</span></td>
                <td>${formatBRL(item.val)}</td>
                <td>
                    <div style="display:flex; gap:10px;">
                        <button class="btn-icon" onclick="openTransactionModal('variable', ${item.id})"><i class="fas fa-pencil-alt"></i></button>
                        <button class="btn-icon" style="color:#ef4444" onclick="delRow('${month}', 'variable', ${item.originalIndex})"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
    else { // Income
        tbody = document.getElementById('tbody-income');
        tbody.innerHTML = '';
        originalList.forEach((item, idx) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.desc}</td>
                <td style="color:var(--success)">${formatBRL(item.val)}</td>
                <td>
                    <div style="display:flex; gap:10px;">
                        <button class="btn-icon" onclick="openTransactionModal('income', ${item.id})"><i class="fas fa-pencil-alt"></i></button>
                        <button class="btn-icon" style="color:#ef4444" onclick="delRow('${month}', 'income', ${idx})"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
}

// --- MODAL DE TRANSAÇÕES ---
function openTransactionModal(type, id = null) {
    const m = document.getElementById('month-select').value;
    const modal = document.getElementById('trans-modal-overlay');
    
    // 1. Limpeza de Campos
    document.getElementById('trans-id').value = '';
    document.getElementById('trans-desc').value = '';
    document.getElementById('trans-val').value = '';
    document.getElementById('trans-cat').value = '';
    document.getElementById('trans-paid').checked = false;

    // 2. Resetar Checkboxes e Selecionar Mês Atual
    document.querySelectorAll('.month-check input').forEach(cb => {
        cb.checked = false;
    });
    
    // 3. --- LÓGICA DE TRAVAMENTO DE DATA (NOVO) ---
    const dateInput = document.getElementById('trans-date');
    const year = new Date().getFullYear();
    const monthIndex = MONTHS.indexOf(m); // 0 para janeiro, 1 para fev...

    // Cria data mínima: Dia 01 do mês selecionado
    // Formato necessário: YYYY-MM-DD
    const pad = (n) => n < 10 ? '0' + n : n;
    const minDate = `${year}-${pad(monthIndex + 1)}-01`;

    // Cria data máxima: Último dia do mês (Dia 0 do mês seguinte)
    const lastDayObj = new Date(year, monthIndex + 1, 0); 
    const maxDate = lastDayObj.toISOString().split('T')[0];

    // Aplica as travas no input
    dateInput.min = minDate;
    dateInput.max = maxDate;
    
    // Define o valor padrão (Se for criação, joga pro dia 1 ou dia atual se estiver dentro do mês)
    const hoje = new Date().toISOString().split('T')[0];
    if (hoje >= minDate && hoje <= maxDate) {
        dateInput.value = hoje;
    } else {
        dateInput.value = minDate;
    }
    // ------------------------------------------------

    // 4. Controle de Visibilidade dos Campos
    document.getElementById('field-date').style.display = (type === 'variable') ? 'block' : 'none';
    document.getElementById('field-cat').style.display = (type === 'variable') ? 'block' : 'none';
    document.getElementById('field-paid').style.display = (type === 'fixed') ? 'block' : 'none';
    
    // Lógica inteligente de meses (Fixed)
    currentTransType = type;
    currentTransId = id;
    originalDesc = null; 

    if (type === 'fixed') {
        document.getElementById('field-months').style.display = 'block';
        // (Lógica de marcar meses - mantida igual)
        if (id) {
            const currentItem = db.months[m][type].find(x => x.id === id);
            if(currentItem) {
                originalDesc = currentItem.desc;
                MONTHS.forEach(month => {
                    const exists = db.months[month].fixed.some(x => x.desc === originalDesc);
                    if (exists) {
                        const checkbox = document.querySelector(`.month-check input[value="${month}"]`);
                        if(checkbox) checkbox.checked = true;
                    }
                });
            }
        } else {
            const checkbox = document.querySelector(`.month-check input[value="${m}"]`);
            if(checkbox) checkbox.checked = true;
        }
    } else {
        document.getElementById('field-months').style.display = 'none';
    }

    // Renderiza Etiquetas se for variável
    if (type === 'variable') {
        renderCategoryChips(id ? db.months[m][type].find(x => x.id === id)?.cat : null);
    }

    const titles = { fixed: 'Nova Despesa Fixa', variable: 'Novo Gasto Variável', income: 'Nova Entrada' };
    document.getElementById('trans-modal-title').innerText = id ? 'Editar Transação' : titles[type];

    // Ajusta placeholder de acordo com o tipo de transação
    const placeholders = { fixed: 'Ex: Conta de Luz', variable: 'Ex: Supermercado', income: 'Ex: Salário' };
    document.getElementById('trans-desc').placeholder = placeholders[type];

    // Preencher campos se for edição
    if (id) {
        const item = db.months[m][type].find(x => x.id === id);
        if (item) {
            document.getElementById('trans-desc').value = item.desc;
            document.getElementById('trans-val').value = item.val;
            if(type === 'variable') {
                // Se já tiver data salva, respeita ela, senão usa o padrão calculado
                if(item.date) dateInput.value = item.date;
                document.getElementById('trans-cat').value = item.cat;
            }
            if(type === 'fixed') {
                document.getElementById('trans-paid').checked = item.paid;
            }
        }
    }

    modal.classList.add('open');
}
function closeTransactionModal() {
    document.getElementById('trans-modal-overlay').classList.remove('open');
}

function toggleAllMonths() {
    const checkboxes = document.querySelectorAll('.month-check input');
    const allChecked = Array.from(checkboxes).every(c => c.checked);
    checkboxes.forEach(c => c.checked = !allChecked);
}

function saveTransactionForm() {
    const currentMonth = document.getElementById('month-select').value;
    const type = currentTransType;
    
    const desc = document.getElementById('trans-desc').value;
    const val = Number(document.getElementById('trans-val').value);
    
    if(!desc || val <= 0) { alert('Preencha descrição e valor.'); return; }

    // --- LÓGICA PARA DESPESAS FIXAS (EM LOTE) ---
    if (type === 'fixed') {
        // Percorre TODOS os meses para sincronizar
        MONTHS.forEach(m => {
            const isChecked = document.querySelector(`.month-check input[value="${m}"]`).checked;
            const list = db.months[m].fixed;
            
            // Tenta encontrar o item neste mês (Pelo ID se for o mês atual, ou pelo Nome Original nos outros)
            // Isso garante que a gente edite o item certo mesmo se o nome mudar
            let idx = -1;
            
            if (currentTransId && m === currentMonth) {
                // No mês atual, usa o ID exato
                idx = list.findIndex(x => x.id === currentTransId);
            } else if (originalDesc) {
                // Nos outros meses, procura pelo nome antigo
                idx = list.findIndex(x => x.desc === originalDesc);
            }

            if (isChecked) {
                // SE O MÊS ESTÁ MARCADO: Atualiza ou Cria
                if (idx > -1) {
                    // Atualiza existente
                    list[idx].desc = desc;
                    list[idx].val = val;
                    // Só atualiza o status de "Pago" se for o mês atual (senão bagunça o controle dos outros meses)
                    if (m === currentMonth) {
                        list[idx].paid = document.getElementById('trans-paid').checked;
                    }
                } else {
                    // Não existe ainda, então cria
                    list.push({
                        id: Date.now() + Math.random(),
                        desc: desc,
                        val: val,
                        paid: false
                    });
                }
            } else {
                // SE O MÊS ESTÁ DESMARCADO: Remove se existir
                if (idx > -1) {
                    list.splice(idx, 1);
                }
            }
        });
    } 
    
    // --- LÓGICA PARA VARIÁVEIS E ENTRADAS (SIMPLES) ---
    else {
        if (currentTransId) {
            // Edição Simples
            const idx = db.months[currentMonth][type].findIndex(x => x.id === currentTransId);
            if(idx > -1) {
                db.months[currentMonth][type][idx].desc = desc;
                db.months[currentMonth][type][idx].val = val;
                
                if(type === 'variable') {
                    db.months[currentMonth][type][idx].date = document.getElementById('trans-date').value;
                    db.months[currentMonth][type][idx].cat = document.getElementById('trans-cat').value || 'Geral';
                }
            }
        } else {
            // Criação Simples
            const newItem = {
                id: Date.now() + Math.random(),
                desc: desc,
                val: val
            };
            if(type === 'variable') {
                newItem.date = document.getElementById('trans-date').value;
                newItem.cat = document.getElementById('trans-cat').value || 'Geral';
            }
            db.months[currentMonth][type].push(newItem);
        }
    }

    saveData();
    renderMonthly();
    closeTransactionModal();
}

function delRow(month, type, idx) {
    if(confirm('Excluir item?')) {
        db.months[month][type].splice(idx, 1);
        saveData();
        renderMonthly();
    }
}

function toggleStatus(month, idx) {
    const current = db.months[month].fixed[idx].paid;
    db.months[month].fixed[idx].paid = !current;
    saveData();
    renderMonthly();
}

// --- CÁLCULOS E GRÁFICOS MINI ---
function updateCalculations() {
    const m = document.getElementById('month-select').value;
    const d = db.months[m];
    const inc = d.income.reduce((a,b)=>a+Number(b.val),0);
    const exp = d.fixed.reduce((a,b)=>a+Number(b.val),0) + d.variable.reduce((a,b)=>a+Number(b.val),0);
    
    document.getElementById('m-balance').innerText = formatBRL(inc - exp);
    document.getElementById('m-inc').innerText = formatBRL(inc);
    document.getElementById('m-exp').innerText = formatBRL(exp);
    updateCategoryChart(d);
}

function updateCategoryChart(data) {
    let cats = {};
    data.variable.forEach(v => {
        let c = v.cat || 'Outros';
        cats[c] = (cats[c] || 0) + Number(v.val);
    });
    const ctx = document.getElementById('catChart').getContext('2d');
    if(window.catChartInst) window.catChartInst.destroy();
    window.catChartInst = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(cats),
            datasets: [{
                data: Object.values(cats),
                backgroundColor: ['#fbbf24', '#34d399', '#f87171', '#60a5fa', '#a78bfa'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            cutout: '70%'
        }
    });
}

// --- METAS (GOALS) ---
function renderGoals() {
    const container = document.getElementById('goals-container');
    container.innerHTML = '';
    if (db.goals.length === 0) {
        container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 40px; opacity: 0.5;"><i class="fas fa-mountain" style="font-size: 3rem;"></i><p>Sem metas.</p></div>`;
        return;
    }
    db.goals.forEach(g => {
        const pct = Math.min(100, (g.current / g.target * 100)).toFixed(1);
        const remaining = g.target - g.current;
        let suggestionHTML = '';
        if (g.date && remaining > 0) {
            const today = new Date();
            const deadline = new Date(g.date);
            const months = (deadline.getFullYear() - today.getFullYear()) * 12 + (deadline.getMonth() - today.getMonth());
            if (months > 0) suggestionHTML = `<div class="suggestion-pill"><i class="fas fa-piggy-bank"></i> Guarde <b>${formatBRL(remaining / months)}</b> /mês</div>`;
            else suggestionHTML = `<div class="suggestion-pill" style="color:var(--danger); border-color:var(--danger); background:rgba(248,113,113,0.1)">Prazo Vencido!</div>`;
        } else if (remaining <= 0) suggestionHTML = `<div class="suggestion-pill" style="color:var(--primary); background:rgba(251,191,36,0.1)">Concluído!</div>`;
        
        const card = document.createElement('div');
        card.className = 'goal-card';
        card.innerHTML = `
            <div class="card-actions">
                <button class="btn-icon" onclick="openGoalModal(${g.id})"><i class="fas fa-pencil-alt"></i></button>
                <button class="btn-icon" style="color:var(--danger)" onclick="deleteGoal(${g.id})"><i class="fas fa-trash"></i></button>
            </div>
            <div>
                <div class="goal-icon-bg"><i class="fas ${g.icon || 'fa-bullseye'}"></i></div>
                <div class="goal-info">
                    <div><div class="goal-name">${g.name}</div><div class="goal-deadline">${g.date ? new Date(g.date).toLocaleDateString('pt-BR', {timeZone:'UTC'}) : 'Sem prazo'}</div></div>
                    <div style="font-weight:bold; color:var(--primary);">${pct}%</div>
                </div>
            </div>
            <div>
                <div class="progress-bg"><div class="progress-fill" style="width: ${pct}%"></div></div>
                <div class="goal-stats" style="margin-top: 8px;"><span>${formatBRL(g.current)}</span><span>${formatBRL(g.target)}</span></div>
            </div>
            ${suggestionHTML}
        `;
        container.appendChild(card);
    });
}

function openGoalModal(id = null) {
    const modal = document.getElementById('goal-modal-overlay');
    document.getElementById('goal-name').value = '';
    document.getElementById('goal-target').value = '';
    document.getElementById('goal-current').value = '';
    document.getElementById('goal-date').value = '';
    
    // Reset ícones
    selectedGoalIcon = 'fa-bullseye';
    document.querySelectorAll('.icon-option').forEach(e => e.classList.remove('active'));
    document.querySelectorAll('.icon-option')[0].classList.add('active');

    currentGoalId = id;
    if (id) {
        const g = db.goals.find(x => x.id === id);
        if (g) {
            document.getElementById('modal-title').innerText = "Editar Meta";
            document.getElementById('goal-name').value = g.name;
            document.getElementById('goal-target').value = g.target;
            document.getElementById('goal-current').value = g.current;
            document.getElementById('goal-date').value = g.date || '';
            
            if(g.icon) {
                selectedGoalIcon = g.icon;
                document.querySelectorAll('.icon-option').forEach(e => {
                   e.classList.remove('active');
                   if(e.innerHTML.includes(g.icon)) e.classList.add('active');
                });
            }
        }
    } else { document.getElementById('modal-title').innerText = "Nova Meta"; }
    modal.classList.add('open');
}

function closeGoalModal() { document.getElementById('goal-modal-overlay').classList.remove('open'); }
function selectIcon(el, icon) { selectedGoalIcon = icon; document.querySelectorAll('.icon-option').forEach(e => e.classList.remove('active')); el.classList.add('active'); }

function saveGoalForm() {
    const name = document.getElementById('goal-name').value;
    const target = Number(document.getElementById('goal-target').value);
    const current = Number(document.getElementById('goal-current').value);
    const date = document.getElementById('goal-date').value;
    
    if (!name || target <= 0) { alert("Preencha corretamente."); return; }
    
    const newGoal = { id: currentGoalId || Date.now(), name, target, current, date, icon: selectedGoalIcon };
    if (currentGoalId) { const idx = db.goals.findIndex(g => g.id === currentGoalId); if (idx > -1) db.goals[idx] = newGoal; }
    else db.goals.push(newGoal);
    
    saveData(); renderGoals(); closeGoalModal();
}
function deleteGoal(id) { if(confirm("Excluir meta?")) { const idx = db.goals.findIndex(g => g.id === id); if(idx > -1) db.goals.splice(idx, 1); saveData(); renderGoals(); } }

// --- LÓGICA DE CATEGORIAS (CHIPS) ---

function renderCategoryChips(currentValue = null) {
    const container = document.getElementById('category-chips-container');
    const input = document.getElementById('trans-cat');
    container.innerHTML = '';

    // 1. Renderiza as Padrões
    DEFAULT_CATEGORIES.forEach(cat => {
        const chip = document.createElement('div');
        chip.className = 'chip';
        // Se o valor atual for igual a esta categoria, marca como ativo
        if (currentValue === cat.name) chip.classList.add('active');
        
        chip.innerHTML = `<i class="fas ${cat.icon}"></i> ${cat.name}`;
        
        // Ao clicar: preenche o input e muda visual do chip
        chip.onclick = () => {
            input.value = cat.name;
            // Remove active de todos e adiciona neste
            document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
        };
        
        container.appendChild(chip);
    });

    // 2. Listener no Input para desmarcar chips se o usuário digitar algo diferente
    input.onkeyup = function() {
        const val = this.value;
        const chips = document.querySelectorAll('.chip');
        let found = false;
        
        chips.forEach(c => {
            c.classList.remove('active');
            if(c.innerText.trim() === val) {
                c.classList.add('active');
                found = true;
            }
        });
    };
}

// --- MENU MOBILE ---

function toggleMobileMenu() {
    const menu = document.getElementById('mobile-menu-overlay');
    // Se já estiver aberto, fecha. Se fechado, abre.
    if (menu.classList.contains('open')) {
        closeMobileMenu();
    } else {
        menu.classList.add('open');
    }
}

function closeMobileMenu() {
    document.getElementById('mobile-menu-overlay').classList.remove('open');
}