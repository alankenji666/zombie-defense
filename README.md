# 🧟 Zombie Defense - Survival Island

Um jogo de sobrevivência 3D desenvolvido com Three.js, Socket.io e Electron. Explore uma ilha, gerencie sua fome e defenda-se de zumbis em um mundo persistente e autoritativo.

## 🚀 Funcionalidades

- **Mundo Persistente**: Banco de dados SQLite para salvar progresso dos jogadores.
- **Multijogador Real-time**: Sincronização de movimentos e ações via Socket.io.
- **Editor de Mapas Integrado**: Crie e edite seus próprios cenários com uma câmera ortográfica sincronizada.
- **Hub Administrativo**: Gerencie o servidor, jogadores e itens através de uma interface Electron robusta.
- **Gráficos 3D Premium**: Utiliza modelos de alta qualidade da biblioteca Kenney e pós-processamento com Unreal Bloom.

## 🛠️ Instalação

### Pré-requisitos
- **Node.js**: Recomendado v20+ ou v25.5.0 (versão validada).

### Passos
1. Clone este repositório.
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Baixe os assets 3D:
   ```bash
   node download_kenney.js
   ```

## 🎮 Como Jogar

### Abrindo o Hub Administrativo
Execute o arquivo `Iniciar_Admin.bat` na raiz do projeto. Ele abrirá a interface administrativa onde você pode:
- Iniciar/Parar o servidor.
- Abrir o Editor de Mapas.
- Monitorar jogadores online.

### Abrindo o Jogo no Navegador
Após iniciar o servidor pelo Hub ou manualmente (`node server/server.js`), acesse:
- **Cliente**: `http://localhost:5173` (se estiver usando Vite `npm run dev`)
- **Produção**: `http://localhost:3000`

## 🛠️ Desenvolvimento

- **Tecnologias**: HTML5, Vanilla CSS, JavaScript (ESM).
- **Engine 3D**: Three.js.
- **Backend**: Express & Socket.io.
- **Desktop**: Electron.

---
Desenvolvido com ❤️ para a comunidade de desenvolvedores de jogos.
