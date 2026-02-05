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
let currentCardId = null;
let currentGoalId = null;
let selectedGoalIcon = 'fa-bullseye';
let originalDesc = null;
let selectedCardColor = '#111';

// Estrutura Inicial do Banco de Dados
let db = {
    months: {},
    goals: [],
    cards: []
};

// Inicializa meses vazios na memória
MONTHS.forEach(m => { db.months[m] = { fixed: [], variable: [], income: [] }; });

// --- INICIALIZAÇÃO ---
window.onload = function() {
    loadData();

    // 1. Detecta Mês Atual
    const hoje = new Date();
    const nomeMes = MONTHS[hoje.getMonth()];
    
    const select = document.getElementById('month-select');
    if(select) select.value = nomeMes;

    const labelMenu = document.getElementById('sidebar-month-label');
    if(labelMenu) {
        const mesCapitalizado = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1);
        labelMenu.innerText = `Gestão de ${mesCapitalizado}`;
    }

    // 2. Verifica qual aba está ativa no HTML e renderiza o conteúdo certo
    if(document.getElementById('view-dashboard').classList.contains('active')) {
        renderDashboard();
    } else if(document.getElementById('view-monthly').classList.contains('active')) {
        renderMonthly();
    } else if(document.getElementById('view-cards').classList.contains('active')) {
        renderCards(); // <--- Adicionado aqui também
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
    // 1. Atualiza Menu Lateral
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.mobile-item').forEach(el => el.classList.remove('active'));
    
    // Se veio de um clique de botão, ativa ele. 
    // Se não (ex: reload), tenta achar o botão correspondente pelo ID da view.
    if(btn) {
        btn.classList.add('active');
    } else {
        // Tenta ativar o botão do menu lateral correspondente a esta view
        const sideBtn = document.querySelector(`.nav-item[onclick*="'${viewId}'"]`);
        if(sideBtn) sideBtn.classList.add('active');
    }
    
    // 2. Atualiza Seções (Esconde todas e mostra a escolhida)
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${viewId}`).classList.add('active');

    // 3. Lógica de Título e Renderização Específica
    const title = document.getElementById('page-title');
    const selector = document.getElementById('month-control');

    if(viewId === 'monthly') {
        title.innerHTML = 'GESTÃO DE <span id="header-month-display">...</span>';
        selector.style.display = 'block'; // Mostra seletor de mês
        renderMonthly();
    } 
    else if (viewId === 'dashboard') {
        title.innerText = "VISÃO GERAL";
        selector.style.display = 'none';
        renderDashboard();
    } 
    else if (viewId === 'cards') { // --- NOVO BLOCO ---
        title.innerText = "MEUS CARTÕES";
        selector.style.display = 'block'; // Mostra mês (para ver faturas passadas)
        renderCards(); // <--- O PULO DO GATO: Renderiza os cartões!
    }
    else { // Assume que é 'goals'
        title.innerText = "METAS & SONHOS";
        selector.style.display = 'none';
        renderGoals();
    }
}

// --- CONTROLE DE MUDANÇA DE MÊS ---
function handleMonthChange() {
    // Verifica se estamos na aba de Cartões
    if(document.getElementById('view-cards').classList.contains('active')) {
        renderCards(); // Se estiver nos cartões, atualiza as faturas
    } 
    // Verifica se estamos na aba Mensal
    else if(document.getElementById('view-monthly').classList.contains('active')) {
        renderMonthly(); // Se estiver na gestão mensal, atualiza as tabelas
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
    
    // Atualiza Titulo
    const header = document.getElementById('header-month-display');
    if(header) header.innerText = m.toUpperCase();

    // Atualiza Card
    const card = document.getElementById('month-name-display');
    if(card) card.innerText = m.toUpperCase();
    
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
    
    // 1. Limpeza de Campos Básicos
    document.getElementById('trans-id').value = '';
    document.getElementById('trans-desc').value = '';
    document.getElementById('trans-val').value = '';
    document.getElementById('trans-cat').value = '';
    document.getElementById('trans-paid').checked = false;

    // 2. Resetar Checkboxes e Selecionar Mês Atual
    document.querySelectorAll('.month-check input').forEach(cb => {
        cb.checked = false;
    });
    
    // 3. --- LÓGICA DE TRAVAMENTO DE DATA ---
    const dateInput = document.getElementById('trans-date');
    const year = new Date().getFullYear();
    const monthIndex = MONTHS.indexOf(m); 

    const pad = (n) => n < 10 ? '0' + n : n;
    const minDate = `${year}-${pad(monthIndex + 1)}-01`;
    const lastDayObj = new Date(year, monthIndex + 1, 0); 
    const maxDate = lastDayObj.toISOString().split('T')[0];

    dateInput.min = minDate;
    dateInput.max = maxDate;
    
    const hoje = new Date().toISOString().split('T')[0];
    if (hoje >= minDate && hoje <= maxDate) {
        dateInput.value = hoje;
    } else {
        dateInput.value = minDate;
    }

    // 4. Controle de Visibilidade dos Campos
    document.getElementById('field-date').style.display = (type === 'variable') ? 'block' : 'none';
    document.getElementById('field-cat').style.display = (type === 'variable') ? 'block' : 'none';
    document.getElementById('field-method').style.display = (type === 'variable') ? 'block' : 'none'; // Campo de Pagamento
    document.getElementById('field-paid').style.display = (type === 'fixed') ? 'block' : 'none';

    // 5. --- RENDERIZAR OPÇÕES DE CARTÃO (PASSO E - NOVO) ---
    if (type === 'variable') {
        const cardContainer = document.getElementById('card-options-container');
        if(cardContainer) {
            cardContainer.innerHTML = ''; // Limpa opções anteriores
            
            // Cria um radio button para cada cartão cadastrado
            if(db.cards && db.cards.length > 0) {
                db.cards.forEach(card => {
                    const label = document.createElement('label');
                    label.className = 'method-opt';
                    label.innerHTML = `
                        <input type="radio" name="trans-method" value="${card.id}" onchange="toggleMethodStyle(this)">
                        <i class="fas fa-credit-card" style="color:${card.color}"></i> ${card.name}
                    `;
                    cardContainer.appendChild(label);
                });
            }
        }
        
        // Reset Visual: Remove 'active' de todos e marca Débito como padrão
        document.querySelectorAll('.method-opt').forEach(el => el.classList.remove('active'));
        const debitInput = document.querySelector('input[value="debit"]');
        if(debitInput) {
            debitInput.checked = true;
            debitInput.parentElement.classList.add('active');
        }
    }
    // -------------------------------------------------------

    // Lógica de Despesa Fixa (Meses)
    currentTransType = type;
    currentTransId = id;
    originalDesc = null; 

    if (type === 'fixed') {
        document.getElementById('field-months').style.display = 'block';
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

    // Renderiza Etiquetas de Categoria
    if (type === 'variable') {
        renderCategoryChips(id ? db.months[m][type].find(x => x.id === id)?.cat : null);
    }

    const titles = { fixed: 'Nova Despesa Fixa', variable: 'Novo Gasto Variável', income: 'Nova Entrada' };
    document.getElementById('trans-modal-title').innerText = id ? 'Editar Transação' : titles[type];

    const placeholders = { fixed: 'Ex: Conta de Luz', variable: 'Ex: Supermercado', income: 'Ex: Salário' };
    document.getElementById('trans-desc').placeholder = placeholders[type];

    // Preencher campos se for EDIÇÃO
    if (id) {
        const item = db.months[m][type].find(x => x.id === id);
        if (item) {
            document.getElementById('trans-desc').value = item.desc;
            document.getElementById('trans-val').value = item.val;
            
            if(type === 'variable') {
                if(item.date) dateInput.value = item.date;
                document.getElementById('trans-cat').value = item.cat;

                // --- RECUPERAR MÉTODO DE PAGAMENTO NA EDIÇÃO ---
                const methodToSelect = item.method || 'debit';
                const radioToCheck = document.querySelector(`input[name="trans-method"][value="${methodToSelect}"]`);
                if(radioToCheck) {
                    radioToCheck.checked = true;
                    // Atualiza visual (remove active dos outros e põe neste)
                    document.querySelectorAll('.method-opt').forEach(el => el.classList.remove('active'));
                    radioToCheck.parentElement.classList.add('active');
                }
            }
            if(type === 'fixed') {
                document.getElementById('trans-paid').checked = item.paid;
            }
        }
    }

    modal.classList.add('open');
}

// --- FUNÇÃO AUXILIAR PARA TROCAR ESTILO DO BOTÃO DE PAGAMENTO ---
function toggleMethodStyle(radio) {
    // Remove a classe .active de todas as opções
    document.querySelectorAll('.method-opt').forEach(el => el.classList.remove('active'));
    // Adiciona a classe .active apenas no pai do radio selecionado
    if(radio.checked) {
        radio.parentElement.classList.add('active');
    }
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
    const type = currentTransType; // 'fixed', 'variable' ou 'income'
    const desc = document.getElementById('trans-desc').value;
    const val = Number(document.getElementById('trans-val').value);
    
    // Captura o método de pagamento
    const methodInput = document.querySelector('input[name="trans-method"]:checked');
    const method = methodInput ? methodInput.value : 'debit'; 

    if(!desc || val <= 0) { alert('Preencha descrição e valor.'); return; }

    // 1. LÓGICA PARA DESPESAS FIXAS
    if (type === 'fixed') {
        MONTHS.forEach(m => {
            const isChecked = document.querySelector(`.month-check input[value="${m}"]`).checked;
            const list = db.months[m].fixed;
            let idx = -1;
            
            if (currentTransId && m === currentMonth) {
                idx = list.findIndex(x => x.id === currentTransId);
            } else if (originalDesc) {
                idx = list.findIndex(x => x.desc === originalDesc);
            }

            if (isChecked) {
                if (idx > -1) {
                    list[idx].desc = desc;
                    list[idx].val = val;
                    if (m === currentMonth) list[idx].paid = document.getElementById('trans-paid').checked;
                } else {
                    list.push({ id: Date.now() + Math.random(), desc: desc, val: val, paid: false });
                }
            } else {
                if (idx > -1) list.splice(idx, 1);
            }
        });
    } 
    
    // 2. LÓGICA PARA GASTOS VARIÁVEIS
    else if (type === 'variable') {
         if (currentTransId) {
            const idx = db.months[currentMonth][type].findIndex(x => x.id === currentTransId);
            if(idx > -1) {
                db.months[currentMonth][type][idx].desc = desc;
                db.months[currentMonth][type][idx].val = val;
                db.months[currentMonth][type][idx].date = document.getElementById('trans-date').value;
                db.months[currentMonth][type][idx].cat = document.getElementById('trans-cat').value || 'Geral';
                db.months[currentMonth][type][idx].method = method; 
            }
        } else {
            const newItem = {
                id: Date.now() + Math.random(),
                desc: desc,
                val: val,
                date: document.getElementById('trans-date').value,
                cat: document.getElementById('trans-cat').value || 'Geral',
                method: method 
            };
            db.months[currentMonth][type].push(newItem);
        }
    }

    // 3. LÓGICA PARA ENTRADAS (ESTAVA FALTANDO ISSO AQUI!)
    else if (type === 'income') {
        if (currentTransId) {
            // Edição de Entrada
            const idx = db.months[currentMonth].income.findIndex(x => x.id === currentTransId);
            if(idx > -1) {
                db.months[currentMonth].income[idx].desc = desc;
                db.months[currentMonth].income[idx].val = val;
            }
        } else {
            // Nova Entrada
            db.months[currentMonth].income.push({
                id: Date.now() + Math.random(),
                desc: desc,
                val: val
            });
        }
    }

    saveData();
    if(document.getElementById('view-cards').classList.contains('active')) renderCards();
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
    const currentMonthName = document.getElementById('month-select').value;
    
    // 1. Descobrir o índice do mês atual (Ex: Março é 2)
    const currentIndex = MONTHS.indexOf(currentMonthName);

    // 2. Calcular o SALDO ANTERIOR (Acumulado dos meses passados)
    let previousBalance = 0;

    // Loop do índice 0 até o mês anterior ao atual
    for (let i = 0; i < currentIndex; i++) {
        const m = MONTHS[i];
        const d = db.months[m];

        // Soma Entradas do mês passado
        const inc = d.income.reduce((a, b) => a + Number(b.val), 0);
        
        // Soma Saídas do mês passado (Fixas + Variáveis Débito)
        const expFixed = d.fixed.reduce((a, b) => a + Number(b.val), 0);
        const expVar = d.variable.reduce((a, b) => {
            if (!b.method || b.method === 'debit') return a + Number(b.val);
            return a;
        }, 0);

        // O que sobrou nesse mês acumula para o próximo
        previousBalance += (inc - (expFixed + expVar));
    }

    // 3. Calcular dados do MÊS ATUAL (Como já fazia antes)
    const currentData = db.months[currentMonthName];
    
    const currentInc = currentData.income.reduce((a, b) => a + Number(b.val), 0);
    
    const currentFixed = currentData.fixed.reduce((a, b) => a + Number(b.val), 0);
    const currentVar = currentData.variable.reduce((a, b) => {
        if (!b.method || b.method === 'debit') return a + Number(b.val);
        return a;
    }, 0);
    
    const currentExp = currentFixed + currentVar;

    // 4. Resultado Final
    // Saldo em Caixa = (O que sobrou dos meses anteriores) + (O que ganhou este mês) - (O que gastou este mês)
    const totalBalance = previousBalance + currentInc - currentExp;

    // 5. Atualizar na Tela
    document.getElementById('m-prev-balance').innerText = formatBRL(previousBalance); // O novo campo pequeno
    document.getElementById('m-balance').innerText = formatBRL(totalBalance); // O saldo grandão
    
    // As linhas de + e - continuam mostrando apenas o desempenho DO MÊS (para você saber se está no vermelho naquele mês específico)
    document.getElementById('m-inc').innerText = formatBRL(currentInc);
    document.getElementById('m-exp').innerText = formatBRL(currentExp);

    updateCategoryChart(currentData);
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

// --- LÓGICA DE CARTÕES ---

function openCardModal(id = null) {
    currentCardId = id; // Define se é edição ou novo
    const modal = document.getElementById('card-modal-overlay');
    
    // Limpa campos
    document.getElementById('card-name').value = '';
    document.getElementById('card-limit').value = '';
    document.getElementById('card-closing').value = '';
    
    // Reseta cor visualmente
    selectCardColor('#111'); 

    // Se for EDIÇÃO, preenche os dados
    if (id) {
        const card = db.cards.find(c => c.id === id);
        if (card) {
            document.getElementById('card-name').value = card.name;
            document.getElementById('card-limit').value = card.limit;
            document.getElementById('card-closing').value = card.closing;
            
            // Marca a cor selecionada. 
            // Truque: Se a cor não for uma das bolinhas padrões, marcamos o botão de "Palette"
            let colorBtn = document.querySelector(`.color-opt[style*="${card.color}"]`);
            if (!colorBtn) {
                // Se não achou nas padrões, marca o seletor personalizado
                colorBtn = document.getElementById('custom-picker-btn');
                // E atualiza o value do input invisível para a cor certa
                colorBtn.querySelector('input').value = card.color;
            }
            
            selectCardColor(card.color, colorBtn);
        }
    }

    modal.classList.add('open');
}
function closeCardModal() {
    document.getElementById('card-modal-overlay').classList.remove('open');
}
function selectCardColor(c) {
    selectedCardColor = c;
    // Feedback visual simples
    document.querySelectorAll('.color-opt').forEach(el => el.style.border = 'none');
    event.target.style.border = '2px solid white';
}

function saveCardForm() {
    const name = document.getElementById('card-name').value;
    const limit = Number(document.getElementById('card-limit').value);
    const closing = document.getElementById('card-closing').value;
    
    if(!name) return alert("Nome obrigatório");

    const cardData = {
        name,
        limit,
        closing,
        color: selectedCardColor
    };

    if (currentCardId) {
        // --- MODO EDIÇÃO ---
        const idx = db.cards.findIndex(c => c.id === currentCardId);
        if (idx > -1) {
            // Mantém o ID original, atualiza o resto
            db.cards[idx] = { ...db.cards[idx], ...cardData };
        }
    } else {
        // --- MODO CRIAÇÃO ---
        db.cards.push({
            id: 'card_' + Date.now(),
            ...cardData
        });
    }

    saveData();
    renderCards();
    closeCardModal();
}

function deleteCard(id) {
    if(confirm("Tem certeza que deseja excluir este cartão? As despesas antigas continuarão salvas, mas você não poderá selecionar este cartão para novos gastos.")) {
        const idx = db.cards.findIndex(c => c.id === id);
        if(idx > -1) {
            db.cards.splice(idx, 1);
            saveData();
            renderCards();
        }
    }
}

function renderCards() {
    const container = document.getElementById('cards-container');
    container.innerHTML = '';
    
    // 1. Identificar Mês Atual e Mês Anterior
    const currentMonthName = document.getElementById('month-select').value;
    const currentIdx = MONTHS.indexOf(currentMonthName);
    
    // Pega o índice do anterior (se for Janeiro [0], volta para Dezembro [11])
    const prevIdx = (currentIdx - 1 + 12) % 12; 
    const prevMonthName = MONTHS[prevIdx];
    
    if(!db.cards || db.cards.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted); grid-column:1/-1; text-align:center; padding: 20px;">Nenhum cartão cadastrado.</p>';
        return;
    }

    db.cards.forEach(card => {
        const closingDay = Number(card.closing) || 31; // Se não tiver dia, assume fim do mês

        // --- CÁLCULO DA FATURA INTELIGENTE ---
        
        // Parte 1: Gastos do Mês Passado (DEPOIS do fechamento)
        // Ex: Se fecha dia 20, pega gastos do dia 21 até 31 do mês passado
        const prevMonthTotal = db.months[prevMonthName].variable
            .filter(item => {
                if (item.method !== card.id) return false;
                if (!item.date) return false;
                const day = parseInt(item.date.split('-')[2]); // Pega o dia da data (YYYY-MM-DD)
                return day > closingDay;
            })
            .reduce((sum, item) => sum + Number(item.val), 0);

        // Parte 2: Gastos do Mês Atual (ANTES ou NO dia do fechamento)
        // Ex: Pega gastos do dia 01 até 20 deste mês
        const currentMonthTotal = db.months[currentMonthName].variable
            .filter(item => {
                if (item.method !== card.id) return false;
                if (!item.date) return false;
                const day = parseInt(item.date.split('-')[2]);
                return day <= closingDay;
            })
            .reduce((sum, item) => sum + Number(item.val), 0);

        // Fatura Real = O que virou do mês passado + O que gastei neste mês até fechar
        const invoiceTotal = prevMonthTotal + currentMonthTotal;
        // -------------------------------------

        // Para o limite disponível, precisamos somar TUDO que ainda não foi pago no cartão globalmente?
        // Simplificação: Vamos considerar Limite - Fatura Atual para facilitar
        // (Num app real, precisaria varrer o histórico todo, mas para PWA simples isso resolve 90%)
        const available = card.limit - invoiceTotal;
        const pct = Math.min(100, (invoiceTotal / card.limit) * 100);

        const cardEl = document.createElement('div');
        cardEl.className = 'credit-card-widget';
        cardEl.style.background = `linear-gradient(135deg, ${card.color}, #000)`;
        
        cardEl.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:start;">
                <div style="font-weight:bold; font-size:1.1rem; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">${card.name}</div>
                <div style="display:flex; gap: 8px;">
                    <button onclick="openCardModal('${card.id}')" class="btn-card-action" title="Editar"><i class="fas fa-pencil-alt"></i></button>
                    <button onclick="deleteCard('${card.id}')" class="btn-card-action" title="Excluir"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            
            <div style="margin-top:20px;">
                <div style="font-size:0.8rem; opacity:0.9;">
                    Fatura de ${currentMonthName.charAt(0).toUpperCase() + currentMonthName.slice(1)}
                    <br><span style="font-size:0.7rem; opacity:0.7;">(Fecha dia ${closingDay})</span>
                </div>
                <div style="font-size:1.5rem; font-weight:bold; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">${formatBRL(invoiceTotal)}</div>
            </div>
            
            <div style="margin-top:15px;">
                <div style="display:flex; justify-content:space-between; font-size:0.7rem; margin-bottom:5px; opacity: 0.9;">
                    <span>Limite Usado ${pct.toFixed(0)}%</span>
                    <span>Disp: ${formatBRL(available)}</span>
                </div>
                <div class="progress-bg" style="background: rgba(255,255,255,0.2);"><div class="progress-fill" style="width:${pct}%; background:#fff; box-shadow: 0 0 10px rgba(255,255,255,0.5);"></div></div>
            </div>
            
            <div style="margin-top:15px; text-align:right;">
                <button onclick="payInvoice('${card.id}', ${invoiceTotal})" class="btn-pay-invoice">Pagar Fatura</button>
            </div>
        `;
        container.appendChild(cardEl);
    });
}

function payInvoice(cardId, amount) {
    if(amount <= 0) return alert("Fatura zerada!");
    const currentMonth = document.getElementById('month-select').value;
    
    if(confirm(`Deseja lançar um pagamento de ${formatBRL(amount)} agora? Isso vai descontar do seu saldo.`)) {
        // Cria uma despesa "Débito" representando o pagamento da fatura
        const cardName = db.cards.find(c => c.id === cardId).name;
        
        db.months[currentMonth].variable.push({
            id: Date.now(),
            desc: `Pagamento Fatura ${cardName}`,
            val: amount,
            date: new Date().toISOString().split('T')[0],
            cat: 'Pagamentos',
            method: 'debit' // Importante: ISSO desconta do saldo
        });

        // Opcional: Você poderia "arquivar" os gastos originais do cartão para não somar na próxima fatura, 
        // mas na lógica simplificada por Mês, basta criar o débito. 
        // O visual da fatura continuará mostrando o total gasto no cartão naquele mês, 
        // mas o saldo geral estará correto (Gastos Cartão [Ignorado] + Pagamento Fatura [Descontado]).
        
        saveData();
        renderMonthly();
        renderCards();
        alert("Pagamento registrado!");
    }
}