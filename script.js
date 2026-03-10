// --- CONFIGURAÇÃO E DADOS ---
const DB_KEY = 'SIP_FINANCE_V3';
const MONTHS = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DEFAULT_CATEGORIES = [
    { name: 'ALIMENTAÇÃO', icon: 'fa-utensils' },
    { name: 'MORADIA', icon: 'fa-home' },
    { name: 'TRANSPORTE', icon: 'fa-car' },
    { name: 'LAZER', icon: 'fa-gamepad' },
    { name: 'SAÚDE', icon: 'fa-heartbeat' },
    { name: 'EDUCAÇÃO', icon: 'fa-graduation-cap' },
    { name: 'COMPRAS', icon: 'fa-shopping-bag' },
    { name: 'SERVIÇOS', icon: 'fa-tools' },
    { name: 'VIAGEM', icon: 'fa-plane' }
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
let sectionCharts = { fixed: null, variable: null };



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
            if (loginScreen) loginScreen.style.display = 'none'; 
            console.log("Logado como:", user.email);

            // --- NOVO: PREENCHE O EMAIL NA TELA ---
            const sideInfo = document.getElementById('sidebar-user-info');
            if(sideInfo) {
                sideInfo.style.display = 'flex'; // Usando flex para alinhar lado a lado
                document.getElementById('sidebar-user-name').innerText = user.displayName || 'Usuário';
                document.getElementById('sidebar-user-email').innerText = user.email;
                document.getElementById('sidebar-user-avatar').src = user.photoURL || 'https://via.placeholder.com/150';
            }

            const mobInfo = document.getElementById('mobile-user-info');
            if(mobInfo) {
                mobInfo.style.display = 'flex';
                document.getElementById('mobile-user-name').innerText = user.displayName || 'Usuário';
                document.getElementById('mobile-user-email').innerText = user.email;
                document.getElementById('mobile-user-avatar').src = user.photoURL || 'https://via.placeholder.com/150';
            }

            
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
        const mesCapitalizado = nomeMes === 'marco' ? 'Março' : nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1);
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
function applyFilterFixed(cat) {
    viewState.filterFixed = cat;
    const m = document.getElementById('month-select').value;
    renderTableRows(m, 'fixed');
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
    let totalInc = 0, totalExpPaid = 0, totalExpCommitted = 0;
    let labels = [], dInc = [], dExp = [];

    const currentMonthIndex = new Date().getMonth();

    MONTHS.forEach((m, index) => {
        const d = db.months[m];
        const inc = d.income.reduce((a,b) => a + Number(b.val), 0);
        
        const varTotal = d.variable.reduce((a,b) => a + Number(b.val), 0);
        
        // Separa os fixos para o Dashboard
        const fixedPaid = d.fixed.filter(x => x.paid).reduce((a,b) => a + Number(b.val), 0);
        const fixedTotal = d.fixed.reduce((a,b) => a + Number(b.val), 0);
        
        const expPaid = fixedPaid + varTotal;
        const expCommitted = fixedTotal + varTotal;

        // Soma até o mês atual para os cards superiores
        if (index <= currentMonthIndex) {
            totalInc += inc;
            totalExpPaid += expPaid;
            totalExpCommitted += expCommitted;
        }

        labels.push(m.substr(0,3).toUpperCase());
        dInc.push(inc);
        dExp.push(expPaid); // O gráfico de evolução mostra a realidade (gastos pagos)
    });

    document.getElementById('kpi-total-inc').innerText = formatBRL(totalInc);
    document.getElementById('kpi-total-exp').innerText = formatBRL(totalExpPaid); 
    
    const balanceReal = totalInc - totalExpPaid;
    const balanceCommitted = totalInc - totalExpCommitted;
    
    document.getElementById('kpi-total-balance').innerText = formatBRL(balanceReal);
    
    const kpiCommitted = document.getElementById('kpi-committed-balance');
    if(kpiCommitted) {
        kpiCommitted.innerText = formatBRL(balanceCommitted);
        kpiCommitted.style.color = balanceCommitted < 0 ? 'var(--danger)' : 'var(--primary)';
    }
    
    const rate = totalInc > 0 ? (balanceReal / totalInc * 100).toFixed(1) : 0;
    document.getElementById('kpi-rate').innerHTML = `
        ${rate}%
        <div style="font-size: 0.8rem; font-weight: 400; color: var(--text-muted); margin-top: 5px;">
            ${formatBRL(balanceReal)}
        </div>
    `;

    // --- GRÁFICO DE LINHA ---
    const chartCanvas = document.getElementById('mainChart');
    if (chartCanvas) {
        const ctx = chartCanvas.getContext('2d');
        if(window.mainChartInst) window.mainChartInst.destroy();
        
        let gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(251, 191, 36, 0.4)');
        gradient.addColorStop(1, 'rgba(251, 191, 36, 0.0)');

        window.mainChartInst = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Saldo Real',
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
}

function renderMonthly() {
    const m = document.getElementById('month-select').value;
    
    const nomeExibicao = m === 'marco' ? 'MARÇO' : m.toUpperCase();
    
    const header = document.getElementById('header-month-display');
    if(header) header.innerText = nomeExibicao;
    const card = document.getElementById('month-name-display');
    if(card) card.innerText = nomeExibicao;
    
    updateCategoryDropdown(m);
    renderTableRows(m, 'fixed');
    renderTableRows(m, 'variable');
    renderTableRows(m, 'income');
    
    updateCalculations();
    renderSectionChart('fixed');
    renderSectionChart('variable'); 
}

function updateCategoryDropdown(month) {
    // --- PARTE 1: VARIÁVEIS ---
    const listVar = db.months[month].variable;
    const catsVar = new Set(['all']);
    
    listVar.forEach(item => { 
        if(item.cat) {
            const catUpper = item.cat.toUpperCase().trim();
            if(catUpper !== 'RECEITA' && catUpper !== 'SALÁRIO') {
                catsVar.add(catUpper); 
            }
        }
    });
    
    const selectVar = document.getElementById('filter-category');
    if(selectVar) {
        const currentSelection = viewState.filter;
        selectVar.innerHTML = ''; 
        catsVar.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c; 
            opt.innerText = c === 'all' ? 'Todas as Categorias' : c;
            selectVar.appendChild(opt);
        });
        selectVar.value = catsVar.has(currentSelection) ? currentSelection : 'all';
    }

    // --- PARTE 2: FIXAS ---
    const listFixed = db.months[month].fixed;
    const catsFixed = new Set(['all']);

    listFixed.forEach(item => { 
        if(item.cat) catsFixed.add(item.cat.toUpperCase().trim()); 
    });

    const selectFixed = document.getElementById('filter-category-fixed');
    if(selectFixed) {
        const currentFixedSelection = viewState.filterFixed || 'all';
        selectFixed.innerHTML = ''; 
        catsFixed.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c; 
            opt.innerText = c === 'all' ? 'Todas as Categorias' : c;
            selectFixed.appendChild(opt);
        });
        selectFixed.value = catsFixed.has(currentFixedSelection) ? currentFixedSelection : 'all';
    }
}

function renderTableRows(month, type) {
    const originalList = db.months[month][type];
    let tbody;

    if(type === 'fixed') {
        tbody = document.getElementById('tbody-fixed');
        tbody.innerHTML = '';
        
        // 1. Cria uma cópia da lista para filtrar
        let displayList = [...originalList];

        // 2. Aplica o filtro se não for "all"
        if (viewState.filterFixed && viewState.filterFixed !== 'all') {
            displayList = displayList.filter(item => (item.cat || '').toUpperCase().trim() === viewState.filterFixed);    
        }

        const totalFixedFiltered = displayList.reduce((sum, item) => sum + Number(item.val), 0);
        document.getElementById('total-fixed').innerText = formatBRL(totalFixedFiltered);

        // 3. Renderiza a lista filtrada (displayList em vez de originalList)
        displayList.forEach((item, idx) => {
            // ... (MANTENHA O CONTEÚDO ORIGINAL DO SEU HTML AQUI DENTRO) ...
            // Vou colocar o código padrão aqui para facilitar, mas use o seu se tiver mudado algo:
            const tr = document.createElement('tr');
            
            // Precisamos achar o índice original para o botão de excluir funcionar certo
            const realIndex = originalList.indexOf(item); 

            tr.innerHTML = `
                <td>
                    <div class="status-badge ${item.paid ? 'status-paid' : 'status-pending'}" onclick="toggleStatus('${month}', ${realIndex})">
                        <i class="fas ${item.paid ? 'fa-check' : 'fa-clock'}"></i> ${item.paid ? 'PAGO' : 'PEND'}
                    </div>
                </td>
                <td>${item.desc}</td>
                <td><span class="status-badge status-pending" style="background:rgba(255, 255, 255, 0.05); color:var(--text-muted)">${(item.cat || 'GERAL').toUpperCase().trim()}</span></td>
                <td>${formatBRL(item.val)}</td>
                <td>
                    <div style="display:flex; gap:10px;">
                        <button class="btn-icon" onclick="openTransactionModal('fixed', ${item.id})"><i class="fas fa-pencil-alt"></i></button>
                        <button class="btn-icon" style="color:#ef4444" onclick="delRow('${month}', 'fixed', ${realIndex})"><i class="fas fa-trash"></i></button>
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
            displayList = displayList.filter(item => (item.cat || '').toUpperCase().trim() === viewState.filter);
        }

        const totalVarFiltered = displayList.reduce((sum, item) => sum + Number(item.val), 0);
        document.getElementById('total-variable').innerText = formatBRL(totalVarFiltered);
        
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
                <td><span class="status-badge status-pending" style="background:rgba(251, 191, 36, 0.1); color:var(--primary)">${(item.cat || 'GERAL').toUpperCase().trim()}</span></td>
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

        const totalInc = originalList.reduce((sum, item) => sum + Number(item.val), 0);
        document.getElementById('total-income').innerText = formatBRL(totalInc);

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
    document.getElementById('field-cat').style.display = (type === 'variable' || type === 'fixed') ? 'block' : 'none';
    document.getElementById('field-method').style.display = (type === 'variable') ? 'block' : 'none'; 
    document.getElementById('field-paid').style.display = (type === 'fixed') ? 'block' : 'none';

    if (type === 'variable' || type === 'fixed') {
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

    if (type === 'variable' || type === 'fixed') {
        // Tenta achar a categoria se estivermos editando um item existente
        const itemAtual = id ? db.months[m][type].find(x => x.id === id) : null;
        renderCategoryChips(itemAtual ? itemAtual.cat : null);
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
            document.getElementById('trans-val').value = formatForInput(item.val);
            
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
    const val = parseCurrency(document.getElementById('trans-val').value);  
    
    const methodInput = document.querySelector('input[name="trans-method"]:checked');
    const method = methodInput ? methodInput.value : 'debit'; 

    if(!desc || val <= 0) { alert('Preencha descrição e valor.'); return; }

    if (type === 'fixed') {
        // Captura se a caixinha "Já foi pago?" está marcada
        const isPaidInput = document.getElementById('trans-paid').checked;

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
                const catValue = (document.getElementById('trans-cat').value || 'CONTAS').toUpperCase().trim();
                
                // Lógica Inteligente: Só marca como pago se for o Mês Atual
                // (Não faz sentido marcar "Janeiro" como pago se estamos em "Fevereiro" criando a conta agora)
                const statusPago = (m === currentMonth) ? isPaidInput : false;

                if (idx > -1) {
                    // EDITANDO
                    list[idx].desc = desc;
                    list[idx].val = val;
                    list[idx].cat = catValue;
                    
                    // Se for o mês atual, atualiza o status de pagamento
                    if (m === currentMonth) list[idx].paid = isPaidInput;
                    
                } else {
                    // CRIANDO NOVA (AQUI ESTAVA O ERRO)
                    list.push({ 
                        id: Date.now() + Math.random(), 
                        desc: desc, 
                        val: val, 
                        cat: catValue, 
                        paid: statusPago // <--- CORREÇÃO: Antes estava 'false' fixo
                    });
                }
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
                db.months[currentMonth][type][idx].cat = (document.getElementById('trans-cat').value || 'GERAL').toUpperCase().trim();
                db.months[currentMonth][type][idx].method = method; 
            }
        } else {
            const newItem = {
                id: Date.now() + Math.random(),
                desc: desc,
                val: val,
                date: document.getElementById('trans-date').value,
                cat: (document.getElementById('trans-cat').value || 'GERAL').toUpperCase().trim(),
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
    
    let previousBalanceReal = 0;
    let previousBalanceCommitted = 0;
    
    // 1. Calcula os meses anteriores
    for (let i = 0; i < currentIndex; i++) {
        const m = MONTHS[i];
        const d = db.months[m];
        
        const inc = d.income.reduce((a, b) => a + Number(b.val), 0);
        
        // Separa o que foi pago do que é o total projetado
        const fixedPaid = d.fixed.filter(x => x.paid).reduce((a, b) => a + Number(b.val), 0);
        const fixedTotal = d.fixed.reduce((a, b) => a + Number(b.val), 0);
        
        const expVar = d.variable.reduce((a, b) => {
            if (!b.method || b.method === 'debit') return a + Number(b.val);
            return a;
        }, 0);
        
        previousBalanceReal += (inc - (fixedPaid + expVar));
        previousBalanceCommitted += (inc - (fixedTotal + expVar));
    }

    // 2. Calcula o mês atual
    const currentData = db.months[currentMonthName];
    const currentInc = currentData.income.reduce((a, b) => a + Number(b.val), 0);
    
    // Filtra gastos fixos pagos vs totais
    const currentFixedPaid = currentData.fixed.filter(x => x.paid).reduce((a, b) => a + Number(b.val), 0);
    const currentFixedTotal = currentData.fixed.reduce((a, b) => a + Number(b.val), 0);
    
    const currentVar = currentData.variable.reduce((a, b) => {
        if (!b.method || b.method === 'debit') return a + Number(b.val);
        return a;
    }, 0);
    
    const currentExpPaid = currentFixedPaid + currentVar;
    const currentExpCommitted = currentFixedTotal + currentVar;
    
    // 3. Resultados Finais
    const totalBalanceReal = previousBalanceReal + currentInc - currentExpPaid;
    const totalBalanceCommitted = previousBalanceCommitted + currentInc - currentExpCommitted;

    // 4. Atualiza a Tela Mensal
    document.getElementById('m-prev-balance').innerText = formatBRL(previousBalanceReal);
    document.getElementById('m-balance').innerText = formatBRL(totalBalanceReal);
    
    const elCommitted = document.getElementById('m-committed-balance');
    if(elCommitted) {
        elCommitted.innerText = formatBRL(totalBalanceCommitted);
        // Deixa vermelho se o comprometido ficar negativo, sênão fica dourado
        elCommitted.style.color = totalBalanceCommitted < 0 ? 'var(--danger)' : 'var(--primary)';
    }

    document.getElementById('m-inc').innerText = formatBRL(currentInc);
    // A despesa no canto superior direito mostra apenas o que JÁ FOI DEBITADO
    document.getElementById('m-exp').innerText = formatBRL(currentExpPaid); 
    
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
                backgroundColor: [
                '#fbbf24', '#34d399', '#f87171', '#60a5fa', '#a78bfa', // Originais
                '#fb923c', '#2dd4bf', '#f472b6', '#38bdf8', '#c084fc', // Variações Médias
                '#a3e635', '#22d3ee', '#e879f9', '#fb7185', '#94a3b8'  // Tons Complementares e Cinza
                ],                
                borderColor: '#ffffff',
                borderWidth: 1.7,
                hoverOffset: 4
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
            document.getElementById('goal-target').value = formatForInput(g.target);
            document.getElementById('goal-current').value = formatForInput(g.current);
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
    const target = parseCurrency(document.getElementById('goal-target').value);
    const current = parseCurrency(document.getElementById('goal-current').value);
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
            document.getElementById('card-limit').value = formatForInput(card.limit);
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
    const limit = parseCurrency(document.getElementById('card-limit').value);
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
    
    // Pega o mês anterior (se for Janeiro, pega Dezembro)
    const prevIdx = (currentIdx - 1 + 12) % 12; 
    const prevMonthName = MONTHS[prevIdx];
    
    if(!db.cards || db.cards.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted); grid-column:1/-1; text-align:center; padding: 20px;">Nenhum cartão cadastrado.</p>';
        return;
    }

    db.cards.forEach(card => {
        const closingDay = Number(card.closing) || 31; // Dia do fechamento

        // --- CÁLCULO DA FATURA MENSAL (O Clássico) ---
        
        // A) Soma gastos do mês ANTERIOR que foram feitos DEPOIS do fechamento
        // (Entram na fatura deste mês)
        const prevMonthTotal = db.months[prevMonthName].variable
            .filter(item => {
                if (item.method !== card.id) return false;
                if (!item.date) return false;
                const day = parseInt(item.date.split('-')[2]); // Pega o dia da data
                return day > closingDay;
            })
            .reduce((sum, item) => sum + Number(item.val), 0);

        // B) Soma gastos do mês ATUAL que foram feitos ANTES do fechamento
        const currentMonthTotal = db.months[currentMonthName].variable
            .filter(item => {
                if (item.method !== card.id) return false;
                if (!item.date) return false;
                const day = parseInt(item.date.split('-')[2]);
                return day <= closingDay;
            })
            .reduce((sum, item) => sum + Number(item.val), 0);

        const invoiceTotal = prevMonthTotal + currentMonthTotal;
        
        // Limite Disponível (Simples: Limite - Fatura Atual)
        // Nota: Se quiser maior precisão no limite global, precisaria somar tudo, 
        // mas para "Visão Mensal" isso costuma bastar.
        const available = card.limit - invoiceTotal;
        const pct = card.limit > 0 ? Math.min(100, (invoiceTotal / card.limit) * 100) : 0;
        
        // Cor da barra
        const progressColor = available < 0 ? 'var(--danger)' : '#fff';

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
                    Fatura de ${currentMonthName === 'marco' ? 'Março' : currentMonthName.charAt(0).toUpperCase() + currentMonthName.slice(1)}
                    <br><span style="font-size:0.7rem; opacity:0.7;">(Fecha dia ${closingDay})</span>
                </div>
                <div style="font-size:1.5rem; font-weight:bold; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">${formatBRL(invoiceTotal)}</div>
            </div>
            <div style="margin-top:15px;">
                <div style="display:flex; justify-content:space-between; font-size:0.7rem; margin-bottom:5px; opacity: 0.9;">
                    <span>Fatura: ${pct.toFixed(0)}% do Limite</span>
                    <span>Disp: ${formatBRL(available)}</span>
                </div>
                <div class="progress-bg" style="background: rgba(255,255,255,0.2);">
                    <div class="progress-fill" style="width:${pct}%; background:${progressColor}; box-shadow: 0 0 10px rgba(255,255,255,0.5);"></div>
                </div>
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
    
    // Pega o mês que está na tela (ex: Fevereiro)
    const currentMonth = document.getElementById('month-select').value;
    
    if(confirm(`Deseja lançar um pagamento de ${formatBRL(amount)}? Isso vai descontar do seu saldo.`)) {
        
        // Encontra o nome do cartão para ficar bonito no extrato
        const cardObj = db.cards.find(c => c.id === cardId);
        const cardName = cardObj ? cardObj.name : 'Cartão';

        // Cria o lançamento
        db.months[currentMonth].variable.push({
            id: Date.now(),
            desc: `Pagamento Fatura ${cardName}`,
            val: amount,
            date: new Date().toISOString().split('T')[0], // Data de hoje
            cat: 'Pagamentos',
            method: 'debit' // Sai do débito (dinheiro vivo)
        });

        saveData();
        renderMonthly(); // Atualiza a tabela de gastos
        
        // Feedback visual
        alert("Pagamento lançado no fluxo de caixa!");
    }
}

// --- LÓGICA DE UI (EXPANDIR/MINIMIZAR) ---

function toggleSectionBody(type, btn) {
    const body = document.getElementById(`body-${type}`);
    const icon = document.getElementById(`icon-${type}`);
    
    // Toggle da classe 'open'
    if (body.classList.contains('open')) {
        body.classList.remove('open');
        icon.className = 'fas fa-chevron-down'; // Ícone aponta pra baixo (fechado)
        btn.classList.remove('active');

        const chartArea = document.getElementById(`chart-area-${type}`);
        if (chartArea) {
            chartArea.classList.remove('show');
        }

        const chartBtn = document.querySelector(`#header-${type} .btn-small-action[onclick*="toggleSectionChart"]`);
        // 3. DESLIGAR O BOTÃO NA FORÇA
        if (chartBtn) {
            chartBtn.classList.remove('active');
        }

        
    } else {
        body.classList.add('open');
        icon.className = 'fas fa-chevron-up'; // Ícone aponta pra cima (aberto)
        btn.classList.add('active');
    }
}

function toggleSectionChart(type, btn) {
    const chartArea = document.getElementById(`chart-area-${type}`);
    const body = document.getElementById(`body-${type}`);
    const iconBtn = document.querySelector(`#header-${type} .btn-small-action:last-child`); // Botão da seta

    // 1. Lógica de Abrir/Fechar
    if (chartArea.classList.contains('show')) {
        chartArea.classList.remove('show');
        btn.classList.remove('active');
    } else {
        // Se a tabela estiver fechada, abre ela primeiro
        if (!body.classList.contains('open')) {
            toggleSectionBody(type, iconBtn);
        }
        
        chartArea.classList.add('show');
        btn.classList.add('active');
        
        // 2. Desenha o gráfico imediatamente
        renderSectionChart(type);
    }
}

function renderSectionChart(type) {
    const chartArea = document.getElementById(`chart-area-${type}`);
    // Só desenha se a área estiver visível (economiza processamento)
    if (!chartArea || !chartArea.classList.contains('show')) return;

    const ctx = document.getElementById(`chart-${type}`).getContext('2d');
    const currentMonth = document.getElementById('month-select').value;
    
    // Pega a lista correta (fixa ou variável)
    const list = db.months[currentMonth][type] || [];

    // Agrupa dados por Categoria
    const grouped = {};
    list.forEach(item => {
        if (!item.cat) return;
        const catUpper = item.cat.toUpperCase().trim();
        
        // Filtra receitas se estiver nas variáveis por engano
        if (catUpper === 'RECEITA' || catUpper === 'SALÁRIO') return;
        
        const cat = catUpper || 'GERAL';
        // Usa Math.abs para garantir números positivos
        grouped[cat] = (grouped[cat] || 0) + Math.abs(Number(item.val));
    });

    const labels = Object.keys(grouped);
    const dataValues = Object.values(grouped);

    // Destrói gráfico anterior se existir para não "bugar" ao passar o mouse
    if (sectionCharts[type]) {
        sectionCharts[type].destroy();
    }

    // Se não tiver dados, não desenha nada (ou desenha vazio)
    if (labels.length === 0) return;

    // Paleta de cores
    const colors = [
        '#fbbf24', '#34d399', '#f87171', '#60a5fa', '#a78bfa', 
        '#fb923c', '#2dd4bf', '#f472b6', '#38bdf8', '#c084fc',
        '#a3e635', '#22d3ee', '#e879f9', '#fb7185', '#94a3b8'
    ];

    // Cria o novo gráfico
    sectionCharts[type] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: dataValues,
                backgroundColor: labels.map((_, i) => colors[i % colors.length]),
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right', // Legenda ao lado
                    labels: { color: '#94a3b8', font: { family: 'Outfit', size: 11 }, boxWidth: 12 }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return ` ${context.label}: ${formatBRL(context.raw)}`;
                        }
                    }
                }
            },
            layout: { padding: 0 },
            cutout: '65%'
        }
    });
}

// --- MÁSCARAS DE MOEDA ---

// 1. Formata o campo enquanto o usuário digita (Restaura centavos da direita pra esquerda)
function maskCurrency(input) {
    let value = input.value.replace(/\D/g, ""); // Remove tudo que não for número
    if (value === "") {
        input.value = "";
        return;
    }
    // Converte para centavos e aplica o padrão brasileiro (ex: 1000 vira 10,00)
    value = (parseInt(value, 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    input.value = value;
}

// 2. Limpa a formatação para salvar no banco de dados (ex: "1.500,00" vira 1500.00)
function parseCurrency(valString) {
    if (!valString) return 0;
    if (typeof valString === 'number') return valString;
    return Number(valString.replace(/\./g, "").replace(",", "."));
}

// 3. Formata o número do banco para exibir no input quando for editar (ex: 1500.00 vira "1.500,00")
function formatForInput(num) {
    if (num === null || num === undefined || isNaN(num)) return "";
    return Number(num).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// --- GERAÇÃO DE RELATÓRIO PDF CORPORATIVO (DESIGN PREMIUM) ---
function generatePDF() {
    const btn = document.getElementById('btn-export-pdf');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando Relatório...';
    btn.disabled = true;

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        const currentMonth = document.getElementById('month-select').value;
        const mesCapitalizado = currentMonth === 'marco' ? 'Março' : currentMonth.charAt(0).toUpperCase() + currentMonth.slice(1);
        const data = db.months[currentMonth];

        // --- CÁLCULOS DO RESUMO (Com Histórico e Cartões) ---
        const currentIndex = MONTHS.indexOf(currentMonth);
        let previousBalanceReal = 0;
        let previousBalanceCommitted = 0;
        
        for (let i = 0; i < currentIndex; i++) {
            const m = MONTHS[i];
            const d = db.months[m];
            const pastInc = d.income.reduce((a, b) => a + Number(b.val), 0);
            const pastFixedPaid = d.fixed.filter(x => x.paid).reduce((a, b) => a + Number(b.val), 0);
            const pastFixedTotal = d.fixed.reduce((a, b) => a + Number(b.val), 0);
            const pastVar = d.variable.reduce((a, b) => (!b.method || b.method === 'debit') ? a + Number(b.val) : a, 0);
            
            previousBalanceReal += (pastInc - (pastFixedPaid + pastVar));
            previousBalanceCommitted += (pastInc - (pastFixedTotal + pastVar));
        }

        const currentInc = data.income.reduce((a, b) => a + Number(b.val), 0);
        const currentFixedPaid = data.fixed.filter(x => x.paid).reduce((a, b) => a + Number(b.val), 0);
        const currentFixedTotal = data.fixed.reduce((a, b) => a + Number(b.val), 0);
        const currentVar = data.variable.reduce((a, b) => (!b.method || b.method === 'debit') ? a + Number(b.val) : a, 0);
        
        const currentExpPaid = currentFixedPaid + currentVar;
        const currentExpCommitted = currentFixedTotal + currentVar;
        
        const balanceReal = previousBalanceReal + currentInc - currentExpPaid;

        // ==========================================
        // 🎨 INÍCIO DO DESIGN DO PDF
        // ==========================================

        // --- 1. CABEÇALHO ESCURO PREMIUM ---
        doc.setFillColor(15, 23, 42); // Fundo Slate 900 (Cor do App)
        doc.rect(0, 0, 210, 40, 'F'); // Barra superior de ponta a ponta

        // Nome do App (Dourado)
        doc.setFontSize(24);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(251, 191, 36); 
        doc.text("S.I.P Finance", 14, 20);

        // Subtítulo e Datas (Branco)
        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(255, 255, 255);
        doc.text(`Relatório de Gestão - ${mesCapitalizado}`, 14, 28);
        doc.text(`Emitido em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 34);

        // --- 2. MINI-DASHBOARD (GRID DE RESUMO) ---
        // Transformamos o resumo de texto em uma tabela limpa e alinhada
        doc.autoTable({
            startY: 50,
            head: [['Saldo Anterior', 'Receitas', 'Despesas Pagas', 'Saldo em Caixa']],
            body: [[
                formatBRL(previousBalanceReal),
                formatBRL(currentInc),
                formatBRL(currentExpPaid),
                formatBRL(balanceReal)
            ]],
            theme: 'grid',
            headStyles: { 
                fillColor: [241, 245, 249], // Fundo cinza bem clarinho
                textColor: [100, 116, 139], // Texto cinza chumbo
                halign: 'center', 
                fontSize: 10,
                lineColor: [226, 232, 240], // Borda suave
                lineWidth: 0.1
            },
            bodyStyles: { 
                halign: 'center', 
                fontSize: 13, 
                fontStyle: 'bold', 
                textColor: [15, 23, 42],
                lineColor: [226, 232, 240],
                lineWidth: 0.1
            },
            columnStyles: {
                3: { textColor: balanceReal >= 0 ? [34, 197, 94] : [239, 68, 68] } // Colore o saldo final de verde ou vermelho
            },
            margin: { left: 14, right: 14 }
        });

        let currentY = doc.lastAutoTable.finalY + 6;

        // Aviso do saldo comprometido mais discreto embaixo do painel
        doc.setFontSize(10);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(100, 116, 139);
        doc.text(`* Saldo Comprometido (Considerando contas pendentes): ${formatBRL(previousBalanceCommitted + currentInc - currentExpCommitted)}`, 14, currentY);
        
        currentY += 15;

        // --- 3. DESIGN DAS TABELAS DE DADOS ---
        const tableOptions = {
            theme: 'plain', // Tira o estilo pesado padrão
            styles: { 
                fontSize: 10, 
                cellPadding: 4, 
                lineColor: [226, 232, 240], 
                lineWidth: { bottom: 0.5 } // Apenas uma linha fina separando as linhas
            },
            margin: { left: 14, right: 14 }
        };

        // TABELA 1: RECEITAS
        if (data.income.length > 0) {
            doc.autoTable({
                ...tableOptions,
                startY: currentY,
                head: [['RECEITAS / ENTRADAS', 'Valor']],
                body: data.income.map(item => [item.desc, formatBRL(item.val)]),
                headStyles: { fillColor: [255, 255, 255], textColor: [52, 211, 153], fontStyle: 'bold', fontSize: 11 }
            });
            currentY = doc.lastAutoTable.finalY + 10;
        }

        // TABELA 2: DESPESAS FIXAS
        if (data.fixed.length > 0) {
            doc.autoTable({
                ...tableOptions,
                startY: currentY,
                head: [['DESPESAS FIXAS', 'Categoria', 'Status', 'Valor']],
                body: data.fixed.map(item => [
                    item.desc, 
                    item.cat || 'GERAL', 
                    item.paid ? 'Pago' : 'Pendente', 
                    formatBRL(item.val)
                ]),
                headStyles: { fillColor: [255, 255, 255], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 11 },
                columnStyles: { 2: { fontStyle: 'italic' } }
            });
            currentY = doc.lastAutoTable.finalY + 10;
        }

        // TABELA 3: GASTOS VARIÁVEIS
        if (data.variable.length > 0) {
            doc.autoTable({
                ...tableOptions,
                startY: currentY,
                head: [['GASTOS VARIÁVEIS', 'Data', 'Categoria', 'Valor']],
                body: data.variable.map(item => [
                    item.desc,
                    item.date ? new Date(item.date).toLocaleDateString('pt-BR', {timeZone:'UTC'}) : '-',
                    item.cat || 'GERAL',
                    formatBRL(item.val)
                ]),
                headStyles: { fillColor: [255, 255, 255], textColor: [251, 191, 36], fontStyle: 'bold', fontSize: 11 }
            });
        }

        // --- RODAPÉ ---
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(9);
            doc.setTextColor(150);
            doc.text(`Página ${i} de ${pageCount} • Gerado por S.I.P Finance`, doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
        }

        // Salva
        doc.save(`SIP_Finance_${mesCapitalizado}.pdf`);

        // Devolve o botão ao normal
        btn.innerHTML = originalText;
        btn.disabled = false;
        
        const t = document.getElementById('toast');
        if(t) {
            t.innerHTML = '<i class="fas fa-check-circle" style="color: var(--success);"></i> Relatório Gerado!';
            t.classList.add('show');
            setTimeout(() => t.classList.remove('show'), 2000);
        }

    } catch (error) {
        console.error("Erro ao gerar PDF:", error);
        btn.innerHTML = originalText;
        btn.disabled = false;
        alert("Ocorreu um erro ao montar o relatório.");
    }
}

// ==========================================
// BUSCA GLOBAL (LUPA)
// ==========================================

function openSearchModal() {
    document.getElementById('search-modal-overlay').classList.add('open');
    document.getElementById('global-search-input').value = '';
    
    // Reseta o estado visual
    document.getElementById('search-results-container').innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 30px 0; font-size: 0.95rem;">
            <i class="fas fa-keyboard" style="font-size: 2rem; margin-bottom: 10px; opacity: 0.5; display: block;"></i>
            Digite algo para pesquisar em todos os meses.
        </div>
    `;
    
    // Foca automaticamente no campo de texto para o usuário já sair digitando
    setTimeout(() => document.getElementById('global-search-input').focus(), 100);
}

function closeSearchModal() {
    document.getElementById('search-modal-overlay').classList.remove('open');
}

function performGlobalSearch() {
    const rawQuery = document.getElementById('global-search-input').value.toLowerCase().trim();
    const container = document.getElementById('search-results-container');
    
    // Só pesquisa se tiver pelo menos 2 letras
    if (rawQuery.length < 2) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 30px 0; font-size: 0.9rem;">Digite pelo menos 2 letras...</div>';
        return;
    }

    // --- A MÁGICA DOS ACENTOS ---
    // Função interna para remover acentos de qualquer texto
    const removeAcentos = (str) => {
        return str ? str.normalize('NFD').replace(/[\u0300-\u036f]/g, "") : "";
    };

    // Remove os acentos do que o utilizador digitou
    const query = removeAcentos(rawQuery);

    let results = [];

    // Vasculha todos os meses do banco
    MONTHS.forEach(m => {
        const data = db.months[m];
        const monthName = m.charAt(0).toUpperCase() + m.slice(1);

        // Procura nas Receitas
        data.income.forEach(item => {
            const desc = removeAcentos(item.desc.toLowerCase());
            if (desc.includes(query)) {
                results.push({ month: monthName, type: 'Receita', desc: item.desc, cat: null, val: Number(item.val), color: 'var(--success)', isExpense: false });
            }
        });

        // Procura nas Fixas
        data.fixed.forEach(item => {
            const desc = removeAcentos(item.desc.toLowerCase());
            const cat = removeAcentos((item.cat || '').toLowerCase());
            if (desc.includes(query) || cat.includes(query)) {
                results.push({ month: monthName, type: 'Fixa', desc: item.desc, cat: item.cat, val: Number(item.val), color: 'var(--danger)', isExpense: true });
            }
        });

        // Procura nas Variáveis
        data.variable.forEach(item => {
            const desc = removeAcentos(item.desc.toLowerCase());
            const cat = removeAcentos((item.cat || '').toLowerCase());
            if (desc.includes(query) || cat.includes(query)) {
                const dateStr = item.date ? item.date.split('-').reverse().join('/') : '';
                results.push({ month: monthName, type: 'Variável', desc: item.desc, cat: item.cat, val: Number(item.val), color: 'var(--danger)', date: dateStr, isExpense: true });
            }
        });
    });

    // Se não achar nada
    if (results.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); padding: 30px 0; font-size: 0.9rem;">
                <i class="fas fa-ghost" style="font-size: 2rem; margin-bottom: 10px; opacity: 0.5; display: block;"></i>
                Nenhum lançamento encontrado.
            </div>`;
        return;
    }

    // Desenha os resultados na tela
    container.innerHTML = '';
    let totalBusca = 0;

    results.forEach(res => {
        totalBusca += res.isExpense ? -Math.abs(res.val) : Math.abs(res.val);

        const catHtml = res.cat ? `<span style="font-size: 0.7rem; color: var(--text-muted); margin-left: 5px;"><i class="fas fa-tag"></i> ${res.cat}</span>` : '';
        const dateHtml = res.date ? `<span style="font-size: 0.7rem; color: var(--text-muted); margin-left: 5px;"><i class="fas fa-calendar-alt"></i> ${res.date}</span>` : '';
        const sign = res.isExpense ? '-' : '+';
        
        const html = `
            <div class="search-result-item">
                <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    <div style="font-weight: 600; font-size: 0.95rem; color: var(--text-main); margin-bottom: 4px;">
                        ${res.desc}
                    </div>
                    <div style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap;">
                        <span class="search-tag" style="background: rgba(255,255,255,0.05); color: var(--text-main);">${res.month}</span>
                        <span class="search-tag" style="color: ${res.color}; border: 1px solid ${res.color};">${res.type}</span>
                        ${catHtml}
                        ${dateHtml}
                    </div>
                </div>
                <div style="font-weight: bold; color: ${res.color}; font-size: 1.05rem; margin-left: 10px; white-space: nowrap;">
                    ${sign} ${formatBRL(res.val)}
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', html);
    });

    const colorTotal = totalBusca >= 0 ? 'var(--success)' : 'var(--danger)';
    container.insertAdjacentHTML('beforeend', `
        <div style="margin-top: 10px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); text-align: right; font-size: 0.9rem; color: var(--text-muted);">
            Saldo desta pesquisa: <span style="color: ${colorTotal}; font-size: 1.1rem; font-weight: bold; margin-left: 5px;">${formatBRL(totalBusca)}</span>
        </div>
    `);
}

// Expõe as funções para o HTML (Caso esteja usando MVC ou módulos)
window.openSearchModal = openSearchModal;
window.closeSearchModal = closeSearchModal;
window.performGlobalSearch = performGlobalSearch;