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

// --- FIREBASE SETUP (O NOVO MOTOR) ---
// Pega as ferramentas que carregamos no HTML
const { db: firestore, auth, provider, signInWithPopup, signOut, onAuthStateChanged, doc, getDoc, setDoc } = window.SIP_FIREBASE;

let currentUser = null; // Guarda quem está logado

// Estado Visual (Filtros e Ordenação)
let viewState = { filter: 'all', sortCol: 'date', sortAsc: true };

// Variáveis Globais de Controle dos Modais
let currentTransId = null;
let currentTransType = null;
let currentCardId = null;
let currentGoalId = null;
let selectedGoalIcon = 'fa-bullseye';
let originalDesc = null;
let selectedCardColor = '#111';

// Estrutura Inicial do Banco de Dados
let db = { months: {}, goals: [], cards: [] };
MONTHS.forEach(m => { db.months[m] = { fixed: [], variable: [], income: [] }; });

// --- INICIALIZAÇÃO (LOGIN CHECK) ---
// Substituímos o window.onload antigo por este que espera o Login
window.onload = function() {
    const statusText = document.getElementById('login-status');
    if(statusText) statusText.innerText = "Conectando ao servidor...";

    // Ouve se o usuário entrou ou saiu
    onAuthStateChanged(auth, async (user) => {
        const loginScreen = document.getElementById('login-screen'); // Pega o elemento

        if (user) {
            // USUÁRIO LOGADO
            currentUser = user;
            
            // CORREÇÃO: Só tenta esconder se o elemento existir
            if (loginScreen) loginScreen.style.display = 'none'; 
            
            console.log("Logado como:", user.email);
            
            await loadDataCloud(); 
            setupUI();
        } else {
            // USUÁRIO DESLOGADO
            currentUser = null;
            
            // CORREÇÃO: Só tenta mostrar se o elemento existir
            if (loginScreen) loginScreen.style.display = 'flex'; 
            
            const statusText = document.getElementById('login-status');
            if(statusText) statusText.innerText = "";
        }
    });
};

function setupUI() {
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
        renderCards();
    } else {
        renderGoals();
    }
}

// --- FUNÇÕES DE AUTH (GOOGLE) ---
async function loginGoogle() {
    try {
        document.getElementById('login-status').innerText = "Abrindo popup do Google...";
        await signInWithPopup(auth, provider);
    } catch (error) {
        alert("Erro no login: " + error.message);
    }
}

async function logoutGoogle() {
    if(confirm("Deseja sair da conta?")) {
        await signOut(auth);
        location.reload(); // Recarrega para limpar memória
    }
}

// --- GERENCIAMENTO DE DADOS (AGORA NA NUVEM) ---

async function loadDataCloud() {
    if (!currentUser) return;
    
    // Tenta pegar do Firebase
    const userRef = doc(firestore, "users", currentUser.uid);
    const docSnap = await getDoc(userRef);

    if (docSnap.exists()) {
        // CENÁRIO 1: Já tem dados na nuvem -> Baixa e usa
        console.log("Dados encontrados na nuvem!");
        db = docSnap.data();
        // Garante integridade
        MONTHS.forEach(m => {
            if(!db.months[m]) db.months[m] = { fixed: [], variable: [], income: [] };
        });
    } else {
        // CENÁRIO 2: Primeira vez na nuvem (Novo Usuário)
        console.log("Conta nova detectada.");
        
        // Verifica se tem dados LOCAIS (do uso antigo)
        const localData = localStorage.getItem(DB_KEY);
        
        if (localData) {
            // AQUI ESTÁ A CORREÇÃO: Pergunta antes de copiar!
            const desejaImportar = confirm("Encontramos dados salvos neste dispositivo. Deseja importá-los para sua nova conta?\n\nOK = Sim, importar dados antigos.\nCancelar = Não, começar conta zerada.");
            
            if (desejaImportar) {
                console.log("Migrando dados locais para a nuvem...");
                try {
                    const parsed = JSON.parse(localData);
                    db = { ...db, ...parsed };
                } catch(e) {}
            } else {
                // Se cancelar, zera a memória RAM para não subir sujeira
                console.log("Iniciando conta limpa.");
                db = { months: {}, goals: [], cards: [] };
                MONTHS.forEach(m => { db.months[m] = { fixed: [], variable: [], income: [] }; });
            }
        }
        // Salva o estado inicial na nuvem (seja importado ou zerado)
        saveData();
    }
    updateCalculations();
}

// Função de Salvar atualizada para o Firebase
async function saveData() {
    if (!currentUser) return;

    const userRef = doc(firestore, "users", currentUser.uid);
    
    try {
        await setDoc(userRef, db);
        showToast();
        updateCalculations();
    } catch (e) {
        console.error("Erro ao salvar na nuvem:", e);
        alert("Erro ao salvar: Verifique sua internet.");
    }
}

function showToast() {
    const t = document.getElementById('toast');
    if(t) {
        t.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Salvo na Nuvem';
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 2000);
    }
}

async function resetSystem() {
    if(confirm("CUIDADO: Isso apagará TODOS os dados NA NUVEM permanentemente. Continuar?")) {
        // 1. Zera a memória local
        db = { months: {}, goals: [], cards: [] }; 
        MONTHS.forEach(m => { db.months[m] = { fixed: [], variable: [], income: [] }; });
        
        // Feedback visual para o usuário não achar que travou
        const statusToast = document.getElementById('toast');
        if(statusToast) {
            statusToast.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Apagando nuvem...';
            statusToast.classList.add('show');
        }

        // 2. ESPERA o Firebase confirmar que apagou lá na nuvem
        await saveData();
        
        // 3. Só agora recarrega a página
        location.reload();
    }
}

// --- NAVEGAÇÃO ---
function switchView(viewId, btn) {
    // 1. Atualiza Menu Lateral
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.mobile-item').forEach(el => el.classList.remove('active'));
    
    if(btn) {
        btn.classList.add('active');
    } else {
        const sideBtn = document.querySelector(`.nav-item[onclick*="'${viewId}'"]`);
        if(sideBtn) sideBtn.classList.add('active');
    }
    
    // 2. Atualiza Seções
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${viewId}`).classList.add('active');

    // 3. Lógica de Título
    const title = document.getElementById('page-title');
    const selector = document.getElementById('month-control');

    if(viewId === 'monthly') {
        title.innerHTML = 'GESTÃO DE <span id="header-month-display">...</span>';
        selector.style.display = 'block'; 
        renderMonthly();
    } 
    else if (viewId === 'dashboard') {
        title.innerText = "VISÃO GERAL";
        selector.style.display = 'none';
        renderDashboard();
    } 
    else if (viewId === 'cards') { 
        title.innerText = "MEUS CARTÕES";
        selector.style.display = 'block'; 
        renderCards();
    }
    else { 
        title.innerText = "METAS & SONHOS";
        selector.style.display = 'none';
        renderGoals();
    }
}

function handleMonthChange() {
    if(document.getElementById('view-cards').classList.contains('active')) {
        renderCards();
    } 
    else if(document.getElementById('view-monthly').classList.contains('active')) {
        renderMonthly(); 
    }
}

// --- IMPORTAR / EXPORTAR (ADAPTADO) ---
function exportData() {
    const dataStr = JSON.stringify(db, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sip_finance_cloud_backup.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function triggerImport() { document.getElementById('import-file').click(); }

function handleImport(input) {
    const file = input.files[0];
    if (!file) return;
    if (!confirm("Isso substituirá seus dados NA NUVEM pelo arquivo. Continuar?")) {
        input.value = ''; return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parsed = JSON.parse(e.target.result);
            if (!parsed.months) throw new Error("Arquivo inválido");
            db = parsed;
            saveData(); // Salva na nuvem
            alert("Importação enviada para a nuvem!");
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
    
    const header = document.getElementById('header-month-display');
    if(header) header.innerText = m.toUpperCase();
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
    const currentSelection = viewState.filter;
    
    select.innerHTML = '';
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
        
        if (viewState.filter !== 'all') {
            displayList = displayList.filter(item => item.cat === viewState.filter);
        }
        
        displayList.sort((a, b) => {
            let valA = a[viewState.sortCol];
            let valB = b[viewState.sortCol];
            if (viewState.sortCol === 'val') { valA = Number(valA); valB = Number(valB); } 
            else { valA = (valA||'').toString().toLowerCase(); valB = (valB||'').toString().toLowerCase(); }
            
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

// --- MODAL DE TRANSAÇÕES (Mantido COMPLETO) ---
function openTransactionModal(type, id = null) {
    const m = document.getElementById('month-select').value;
    const modal = document.getElementById('trans-modal-overlay');
    
    document.getElementById('trans-id').value = '';
    document.getElementById('trans-desc').value = '';
    document.getElementById('trans-val').value = '';
    document.getElementById('trans-cat').value = '';
    document.getElementById('trans-paid').checked = false;

    document.querySelectorAll('.month-check input').forEach(cb => { cb.checked = false; });
    
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

    document.getElementById('field-date').style.display = (type === 'variable') ? 'block' : 'none';
    document.getElementById('field-cat').style.display = (type === 'variable') ? 'block' : 'none';
    document.getElementById('field-method').style.display = (type === 'variable') ? 'block' : 'none'; 
    document.getElementById('field-paid').style.display = (type === 'fixed') ? 'block' : 'none';

    if (type === 'variable') {
        const cardContainer = document.getElementById('card-options-container');
        if(cardContainer) {
            cardContainer.innerHTML = ''; 
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
        document.querySelectorAll('.method-opt').forEach(el => el.classList.remove('active'));
        const debitInput = document.querySelector('input[value="debit"]');
        if(debitInput) {
            debitInput.checked = true;
            debitInput.parentElement.classList.add('active');
        }
    }

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

    if (type === 'variable') {
        renderCategoryChips(id ? db.months[m][type].find(x => x.id === id)?.cat : null);
    }

    const titles = { fixed: 'Nova Despesa Fixa', variable: 'Novo Gasto Variável', income: 'Nova Entrada' };
    document.getElementById('trans-modal-title').innerText = id ? 'Editar Transação' : titles[type];

    const placeholders = { fixed: 'Ex: Conta de Luz', variable: 'Ex: Supermercado', income: 'Ex: Salário' };
    document.getElementById('trans-desc').placeholder = placeholders[type];

    if (id) {
        // Correção para achar ID também no Income
        const item = db.months[m][type].find(x => x.id === id);
        if (item) {
            document.getElementById('trans-desc').value = item.desc;
            document.getElementById('trans-val').value = item.val;
            
            if(type === 'variable') {
                if(item.date) dateInput.value = item.date;
                document.getElementById('trans-cat').value = item.cat;
                const methodToSelect = item.method || 'debit';
                const radioToCheck = document.querySelector(`input[name="trans-method"][value="${methodToSelect}"]`);
                if(radioToCheck) {
                    radioToCheck.checked = true;
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

function toggleMethodStyle(radio) {
    document.querySelectorAll('.method-opt').forEach(el => el.classList.remove('active'));
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
    const type = currentTransType;
    const desc = document.getElementById('trans-desc').value;
    const val = Number(document.getElementById('trans-val').value);
    
    const methodInput = document.querySelector('input[name="trans-method"]:checked');
    const method = methodInput ? methodInput.value : 'debit'; 

    if(!desc || val <= 0) { alert('Preencha descrição e valor.'); return; }

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
    // LÓGICA PARA ENTRADAS (Mantida!)
    else if (type === 'income') {
        if (currentTransId) {
            const idx = db.months[currentMonth].income.findIndex(x => x.id === currentTransId);
            if(idx > -1) {
                db.months[currentMonth].income[idx].desc = desc;
                db.months[currentMonth].income[idx].val = val;
            }
        } else {
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
    db.months[month].fixed[idx].paid = !db.months[month].fixed[idx].paid;
    saveData();
    renderMonthly();
}

// --- CÁLCULOS E GRÁFICOS MINI ---
function updateCalculations() {
    const currentMonthName = document.getElementById('month-select').value;
    const currentIndex = MONTHS.indexOf(currentMonthName);
    let previousBalance = 0;
    
    for (let i = 0; i < currentIndex; i++) {
        const m = MONTHS[i];
        const d = db.months[m];
        const inc = d.income.reduce((a, b) => a + Number(b.val), 0);
        const expFixed = d.fixed.reduce((a, b) => a + Number(b.val), 0);
        const expVar = d.variable.reduce((a, b) => {
            if (!b.method || b.method === 'debit') return a + Number(b.val);
            return a;
        }, 0);
        previousBalance += (inc - (expFixed + expVar));
    }

    const currentData = db.months[currentMonthName];
    const currentInc = currentData.income.reduce((a, b) => a + Number(b.val), 0);
    const currentFixed = currentData.fixed.reduce((a, b) => a + Number(b.val), 0);
    const currentVar = currentData.variable.reduce((a, b) => {
        if (!b.method || b.method === 'debit') return a + Number(b.val);
        return a;
    }, 0);
    
    const currentExp = currentFixed + currentVar;
    const totalBalance = previousBalance + currentInc - currentExp;

    document.getElementById('m-prev-balance').innerText = formatBRL(previousBalance);
    document.getElementById('m-balance').innerText = formatBRL(totalBalance);
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

// --- METAS (Mantido) ---
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

// --- CHIPS ---
function renderCategoryChips(currentValue = null) {
    const container = document.getElementById('category-chips-container');
    const input = document.getElementById('trans-cat');
    container.innerHTML = '';
    DEFAULT_CATEGORIES.forEach(cat => {
        const chip = document.createElement('div');
        chip.className = 'chip';
        if (currentValue === cat.name) chip.classList.add('active');
        chip.innerHTML = `<i class="fas ${cat.icon}"></i> ${cat.name}`;
        chip.onclick = () => {
            input.value = cat.name;
            document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
        };
        container.appendChild(chip);
    });
    input.onkeyup = function() {
        const val = this.value;
        const chips = document.querySelectorAll('.chip');
        chips.forEach(c => {
            c.classList.remove('active');
            if(c.innerText.trim() === val) c.classList.add('active');
        });
    };
}

// --- MENU MOBILE ---
function toggleMobileMenu() {
    const menu = document.getElementById('mobile-menu-overlay');
    if (menu.classList.contains('open')) closeMobileMenu();
    else menu.classList.add('open');
}
function closeMobileMenu() { document.getElementById('mobile-menu-overlay').classList.remove('open'); }

// --- CARTÕES (Mantido com Lógica de Fatura Inteligente) ---
function openCardModal(id = null) {
    currentCardId = id; 
    const modal = document.getElementById('card-modal-overlay');
    document.getElementById('card-name').value = '';
    document.getElementById('card-limit').value = '';
    document.getElementById('card-closing').value = '';
    selectCardColor('#111'); 
    if (id) {
        const card = db.cards.find(c => c.id === id);
        if (card) {
            document.getElementById('card-name').value = card.name;
            document.getElementById('card-limit').value = card.limit;
            document.getElementById('card-closing').value = card.closing;
            let colorBtn = document.querySelector(`.color-opt[style*="${card.color}"]`);
            if (!colorBtn) { colorBtn = document.getElementById('custom-picker-btn'); colorBtn.querySelector('input').value = card.color; }
            selectCardColor(card.color, colorBtn);
        }
    }
    modal.classList.add('open');
}
function closeCardModal() { document.getElementById('card-modal-overlay').classList.remove('open'); }
function selectCardColor(c, el) { 
    selectedCardColor = c; 
    document.querySelectorAll('.color-opt').forEach(el => { el.style.border = '2px solid transparent'; el.style.transform = 'scale(1)'; });
    document.querySelectorAll('.color-picker-wrapper').forEach(el => { el.style.border = '2px solid transparent'; el.style.transform = 'scale(1)'; });
    if(el) { el.style.border = '2px solid white'; el.style.transform = 'scale(1.1)'; }
}
function saveCardForm() {
    const name = document.getElementById('card-name').value;
    const limit = Number(document.getElementById('card-limit').value);
    const closing = document.getElementById('card-closing').value;
    if(!name) return alert("Nome obrigatório");
    const cardData = { name, limit, closing, color: selectedCardColor };
    if (currentCardId) { const idx = db.cards.findIndex(c => c.id === currentCardId); if (idx > -1) db.cards[idx] = { ...db.cards[idx], ...cardData }; }
    else { db.cards.push({ id: 'card_' + Date.now(), ...cardData }); }
    saveData(); renderCards(); closeCardModal();
}
function deleteCard(id) {
    if(confirm("Tem certeza que deseja excluir este cartão?")) {
        const idx = db.cards.findIndex(c => c.id === id);
        if(idx > -1) { db.cards.splice(idx, 1); saveData(); renderCards(); }
    }
}

function renderCards() {
    const container = document.getElementById('cards-container');
    container.innerHTML = '';
    
    // 1. Identificar Mês Atual e Mês Anterior
    const currentMonthName = document.getElementById('month-select').value;
    const currentIdx = MONTHS.indexOf(currentMonthName);
    const prevIdx = (currentIdx - 1 + 12) % 12; 
    const prevMonthName = MONTHS[prevIdx];
    
    if(!db.cards || db.cards.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted); grid-column:1/-1; text-align:center; padding: 20px;">Nenhum cartão cadastrado.</p>';
        return;
    }

    db.cards.forEach(card => {
        const closingDay = Number(card.closing) || 31; // Se não tiver dia, assume fim do mês

        // --- CÁLCULO DA FATURA INTELIGENTE ---
        const prevMonthTotal = db.months[prevMonthName].variable
            .filter(item => {
                if (item.method !== card.id) return false;
                if (!item.date) return false;
                const day = parseInt(item.date.split('-')[2]);
                return day > closingDay;
            })
            .reduce((sum, item) => sum + Number(item.val), 0);

        const currentMonthTotal = db.months[currentMonthName].variable
            .filter(item => {
                if (item.method !== card.id) return false;
                if (!item.date) return false;
                const day = parseInt(item.date.split('-')[2]);
                return day <= closingDay;
            })
            .reduce((sum, item) => sum + Number(item.val), 0);

        const invoiceTotal = prevMonthTotal + currentMonthTotal;
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
        const cardName = db.cards.find(c => c.id === cardId).name;
        db.months[currentMonth].variable.push({
            id: Date.now(),
            desc: `Pagamento Fatura ${cardName}`,
            val: amount,
            date: new Date().toISOString().split('T')[0],
            cat: 'Pagamentos',
            method: 'debit'
        });
        saveData();
        renderMonthly();
        renderCards();
        alert("Pagamento registrado!");
    }
}