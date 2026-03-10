# 📊 S.I.P Finance

> **Seu sistema financeiro pessoal e profissional, na palma da mão.**

O **S.I.P Finance** é uma aplicação Web Progressiva (PWA) desenvolvida para controle de finanças pessoais. Com uma interface Premium e acessível, o sistema oferece desde o controle básico de fluxo de caixa até a gestão avançada de faturas de cartões de crédito e geração de relatórios corporativos.

## ✨ Funcionalidades Principais

* 🔐 **Autenticação Segura:** Login integrado com contas Google usando Firebase Auth.
* ☁️ **Sincronização em Nuvem:** Seus dados salvos em tempo real e acessíveis de qualquer dispositivo através do Firebase Firestore.
* 📱 **PWA (Progressive Web App):** Instalável no celular (iOS e Android) como um aplicativo nativo, com design 100% responsivo e navegação inferior ergonômica.
* 📈 **Dashboard Dinâmico:** Gráficos interativos (Chart.js) que mostram o balanço do mês, divisão por categorias e taxas de economia.
* 💳 **Gestão de Cartões de Crédito:** Controle de limites e cálculo automático de faturas baseado no dia de fechamento.
* 🎯 **Metas e Sonhos:** Acompanhamento visual de objetivos financeiros com barras de progresso e cálculo inteligente de parcelas mensais necessárias.
* 📄 **Relatórios Corporativos:** Geração nativa de extratos mensais em formato PDF profissional (com cabeçalho, KPIs e tabelas estruturadas).
* 🔄 **Portabilidade de Dados:** Opções para exportar e importar o banco de dados inteiro no formato JSON.

## 🛠️ Tecnologias Utilizadas

Este projeto foi construído utilizando tecnologias modernas e bibliotecas focadas em performance:

* **Front-end:** HTML5, CSS3 (CSS Variables, Flexbox/Grid) e JavaScript (Vanilla ES6+).
* **Back-end & Banco de Dados:** Firebase (Authentication & Cloud Firestore).
* **Visualização de Dados:** Chart.js (Gráficos de Linha e Rosquinha).
* **Geração de Documentos:** jsPDF e jsPDF-AutoTable (Geração de relatórios PDF no lado do cliente).
* **Ícones e Fontes:** FontAwesome 6 e Google Fonts (Outfit & JetBrains Mono).

## 🚀 Como Executar o Projeto

Como a aplicação é 100% client-side e utiliza o Firebase como backend as a service (BaaS), rodar o projeto localmente é extremamente simples:

1. Clone este repositório:
   ```bash
   git clone [https://github.com/SEU_USUARIO/sistemafinanceiro.git](https://github.com/SEU_USUARIO/sistemafinanceiro.git)
Abra a pasta do projeto.

Para rodar localmente com todas as funcionalidades (especialmente requisições de módulos e PDF), inicie um servidor local. Se estiver usando o VS Code, utilize a extensão Live Server.

Nota: Abrir o arquivo index.html diretamente (via file://) pode bloquear o funcionamento do Firebase e do gerador de PDF devido às políticas de CORS do navegador.

📂 Estrutura do Projeto

index.html: Estrutura principal, modais e templates da aplicação.

style.css: Design System completo, responsividade (Media Queries) e temas.

script.js: Regras de negócio, cálculos financeiros, integração com Firebase e geração de PDF.

manifest.json: Configurações de PWA para instalação mobile.


---

Desenvolvido com dedicação para elevar o nível da gestão financeira pessoal. 🚀