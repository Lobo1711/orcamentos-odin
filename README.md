# Orçamentos Odin

## Desenvolvimento local

Instale as dependências e rode:

```sh
npm ci
npm run dev
```

O script `predev` aplica automaticamente as migrações no D1 local. Abra o endereço exibido pelo Wrangler. O D1 local é simulado pelo Wrangler; `.dev.vars` e `.wrangler/` não devem ser enviados ao Git.

Não há login: os rascunhos ficam acessíveis publicamente pela aplicação e pelas rotas da API. Qualquer visitante pode listar, criar, alterar ou excluir os registros. Não armazene dados pessoais ou confidenciais. Para gerar um PDF, use “Gerar PDF” e escolha “Salvar como PDF” na janela de impressão do navegador; o arquivo é salvo localmente pelo navegador, não na nuvem.

## Configuração Cloudflare para produção

1. Crie um banco D1 na conta Cloudflare.
2. Atualize `database_id` e `database_name` em `wrangler.toml` com o recurso criado.
3. Aplique a migração no D1 remoto:

   ```sh
   npx wrangler d1 migrations apply orcamentos-odin --remote
   ```

4. Publique o Worker:

   ```sh
   npx wrangler deploy
   ```
