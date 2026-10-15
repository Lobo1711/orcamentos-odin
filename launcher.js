// Carrega o módulo que permite iniciar o servidor principal como um processo separado.
const { spawn, spawnSync } = require('child_process');
// Carrega o módulo HTTP nativo usado para verificar quando o site está disponível.
const http = require('http');
// Carrega o módulo que executa o navegador padrão do Windows.
const { execFile } = require('child_process');
// Carrega o módulo que resolve os caminhos dos arquivos do projeto.
const path = require('path');

// Define a porta usada pelo servidor ou respeita uma porta informada pelo ambiente.
const port = Number(process.env.PORT) || 8787;
// Monta o endereço local usado para abrir e testar o site.
const siteUrl = `http://127.0.0.1:${port}`;
// Define o caminho absoluto da ferramenta Wrangler instalada no projeto.
const wranglerPath = path.join(__dirname, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

// Verifica se o servidor já está respondendo antes de iniciar outro processo.
function isServerRunning() {
  // Retorna uma promessa para aguardar o resultado da verificação HTTP.
  return new Promise((resolve) => {
    // Cria uma requisição simples para a página inicial.
    const request = http.get(siteUrl, (response) => {
      // Descarta os dados recebidos porque somente o status é necessário.
      response.resume();
      // Considera o servidor disponível quando ele responde com qualquer status HTTP.
      resolve(true);
    });
    // Evita que uma falha de conexão encerre o lançador com uma exceção.
    request.on('error', () => resolve(false));
    // Impede que uma conexão travada aguarde indefinidamente.
    request.setTimeout(2000, () => {
      // Fecha a requisição que excedeu o tempo limite.
      request.destroy();
      // Informa que o servidor ainda não está disponível.
      resolve(false);
    });
  });
}

// Abre o endereço no navegador padrão sem depender do npm ou do PowerShell.
function openBrowser() {
  // Usa o interpretador de comandos do Windows para abrir a URL.
  execFile('cmd.exe', ['/c', 'start', '', siteUrl], (error) => {
    // Mostra o erro real caso o Windows não consiga abrir o navegador.
    if (error) {
      console.error(`Não foi possível abrir o navegador automaticamente: ${error.message}`);
    }
  });
}

// Aguarda o servidor responder antes de liberar o navegador.
async function waitForServer() {
  // Tenta verificar o Worker local por até trinta segundos.
  for (let attempt = 0; attempt < 60; attempt += 1) {
    // Encerra a espera assim que a página estiver disponível.
    if (await isServerRunning()) {
      return true;
    }
    // Aguarda meio segundo antes da próxima tentativa.
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  // Informa ao chamador que o servidor não ficou disponível no prazo.
  return false;
}

// Inicializa o fluxo completo de execução do site.
async function main() {
  // Reutiliza o servidor existente quando ele já estiver ativo.
  if (!(await isServerRunning())) {
    const migration = spawnSync(
      process.execPath,
      [wranglerPath, 'd1', 'migrations', 'apply', 'orcamentos-odin', '--local'],
      { cwd: __dirname, stdio: 'inherit' }
    );
    if (migration.error || migration.status !== 0) {
      console.error(`Não foi possível preparar o D1 local: ${migration.error?.message || 'falha na migração'}`);
      process.exitCode = 1;
      return;
    }

    const server = spawn(
      process.execPath,
      [wranglerPath, 'dev', '--ip', '127.0.0.1', '--port', String(port)],
      {
        cwd: __dirname,
        detached: true,
        stdio: 'ignore'
      }
    );
    server.on('error', (error) => {
      console.error(`Não foi possível iniciar o Worker local: ${error.message}`);
    });
    // Libera o lançador para terminar sem encerrar o servidor filho.
    server.unref();
  }

  // Aguarda a aplicação ficar realmente acessível.
  const ready = await waitForServer();
  // Interrompe com uma mensagem clara quando o servidor não inicia.
  if (!ready) {
    console.error(`O site não respondeu em ${siteUrl} após 30 segundos.`);
    process.exitCode = 1;
    return;
  }

  // Exibe o endereço confirmado no terminal.
  console.log(`Site disponível em ${siteUrl}`);
  // Abre o site somente depois da confirmação da porta.
  openBrowser();
}

// Executa o lançador e mostra erros inesperados sem ocultar a causa.
main().catch((error) => {
  console.error(`Falha ao iniciar o site: ${error.message}`);
  process.exitCode = 1;
});
