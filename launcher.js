// Carrega o módulo que permite iniciar o servidor principal como um processo separado.
const { spawn } = require('child_process');
// Carrega o módulo HTTP nativo usado para verificar quando o site está disponível.
const http = require('http');
// Carrega o módulo que executa o navegador padrão do Windows.
const { execFile } = require('child_process');
// Carrega o módulo que resolve os caminhos dos arquivos do projeto.
const path = require('path');

// Define a porta usada pelo servidor ou respeita uma porta informada pelo ambiente.
const port = Number(process.env.PORT) || 3001;
// Monta o endereço local usado para abrir e testar o site.
const siteUrl = `http://127.0.0.1:${port}`;
// Define o caminho absoluto do arquivo que inicia o servidor Express.
const serverPath = path.join(__dirname, 'server.js');

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
  // Tenta verificar o servidor por até vinte segundos.
  for (let attempt = 0; attempt < 40; attempt += 1) {
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
    // Inicia o servidor com o mesmo executável Node usado pelo lançador.
    const server = spawn(process.execPath, [serverPath], {
      cwd: __dirname,
      detached: true,
      stdio: 'ignore'
    });
    // Libera o lançador para terminar sem encerrar o servidor filho.
    server.unref();
  }

  // Aguarda a aplicação ficar realmente acessível.
  const ready = await waitForServer();
  // Interrompe com uma mensagem clara quando o servidor não inicia.
  if (!ready) {
    console.error(`O site não respondeu em ${siteUrl} após 20 segundos.`);
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
