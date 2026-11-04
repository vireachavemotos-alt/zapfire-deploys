# Deploy ZapFire — Oracle Cloud Always Free + Cloudflare Tunnel

Custo total: **R$ 0/mês**.
Tempo total: **~45 minutos** na primeira vez.

Este é o caminho UM. Sem alternativas, sem ramificações. Siga em ordem.

---

## O que você vai ter no fim

- ZapFire rodando 24/7 numa VM ARM grátis da Oracle (4 CPU, 24 GB RAM)
- HTTPS automático via Cloudflare em `zapfire.seudominio.com`
- Login multi-usuário (Cloudflare Access) — só e-mails autorizados entram
- Acessível do celular, de qualquer pessoa, em qualquer lugar
- Computador da casa pode ficar desligado

---

## Etapa 1 — Conta na Oracle Cloud (10 min)

1. https://www.oracle.com/cloud/free/ → **Start for free**
2. Cadastra com e-mail real, telefone real (vai receber SMS de verificação)
3. **Cartão de crédito é obrigatório pra validação**, mas a Oracle promete não cobrar nada do free tier — e cumprem (o autor já usa há anos)
4. **Home region:** escolhe a mais próxima (`São Paulo (sa-saopaulo-1)` aceita free tier; senão tenta Ashburn US-East)
5. Cadastro confirmado por e-mail → entra no console: https://cloud.oracle.com

---

## Etapa 2 — Criar a VM ARM Free (10 min)

> ⚠️ **Free tier ARM A1 às vezes está esgotado** ("Out of capacity"). Se der esse erro, **tenta de novo a cada hora**. Costuma liberar.

1. Console Oracle → menu hambúrguer → **Compute → Instances → Create instance**

2. Preenche:
   - **Name:** `zapfire-vm`
   - **Image:** clica em **Change image** → Canonical Ubuntu → versão **22.04** → arquitetura **Aarch64**
   - **Shape:** clica em **Change shape** → categoria **Ampere** → seleciona **VM.Standard.A1.Flex** → ajusta sliders pra **4 OCPU** + **24 GB memory** (tudo free)
   - **Networking:** deixa o default (cria VCN automática)
   - **Add SSH keys:** marca "Generate a key pair for me" → clica em **Save private key** e **Save public key** → guarda os dois arquivos no seu Mac (em `~/.ssh/oracle-zapfire.key` por exemplo)
3. Clica em **Create**
4. Espera ~2 min até status virar **Running**
5. **Copia o Public IP Address** que aparece no painel (algo tipo `129.213.xx.xx`)

### Ajusta permissão da chave SSH (no seu Mac)

```bash
chmod 600 ~/.ssh/oracle-zapfire.key
```

### Testa conexão SSH

```bash
ssh -i ~/.ssh/oracle-zapfire.key ubuntu@SEU-IP-ORACLE
# Aceita o fingerprint na primeira vez
# Deve abrir o prompt: ubuntu@zapfire-vm:~$
```

Se conectou, manda `exit` e segue.

---

## Etapa 3 — Setup do servidor (10 min)

Conecta SSH e cola tudo isso:

```bash
ssh -i ~/.ssh/oracle-zapfire.key ubuntu@SEU-IP-ORACLE
```

Dentro do server:

```bash
# Atualiza o sistema
sudo apt update && sudo apt upgrade -y

# Instala Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER

# Cria diretório do projeto
sudo mkdir -p /opt/zapfire
sudo chown $USER:$USER /opt/zapfire

# Sai do SSH pra o group docker pegar
exit
```

Reconecta:

```bash
ssh -i ~/.ssh/oracle-zapfire.key ubuntu@SEU-IP-ORACLE
docker --version            # confirma instalação
docker compose version
```

---

## Etapa 4 — Subir o código (5 min)

**Do seu Mac**, num terminal novo (mantém o SSH aberto na outra janela):

```bash
# O bundle já está pronto em /tmp
ls -lh /tmp/zapfire-deploy-*.tar.gz

# Manda pro servidor
scp -i ~/.ssh/oracle-zapfire.key \
  /tmp/zapfire-deploy-20260426.tar.gz \
  ubuntu@SEU-IP-ORACLE:/opt/zapfire/

# (Opcional) confirma chegou
ssh -i ~/.ssh/oracle-zapfire.key ubuntu@SEU-IP-ORACLE \
  "ls -lh /opt/zapfire/"
```

**De volta no SSH do servidor** (a outra janela):

```bash
cd /opt/zapfire
tar xzf zapfire-deploy-*.tar.gz
ls -la                    # deve mostrar Dockerfile, docker-compose.prod.yml, etc

# Renomeia o env de produção
mv .env.production .env

# Edita pra trocar o domínio
nano .env
# Ajusta a linha:
#   DOMAIN=zapfire.seudominio.com  ← coloca seu domínio real
# Salva (Ctrl+O, Enter, Ctrl+X)
```

---

## Etapa 5 — Cloudflare: domínio + tunnel (15 min)

### 5a — Adicionar domínio no Cloudflare (se ainda não tem)

1. https://dash.cloudflare.com → cria conta grátis
2. **+ Add a site** → digita seu domínio → plano **Free**
3. Cloudflare lista 2 nameservers (algo tipo `dexter.ns.cloudflare.com`)
4. Vai no painel do seu registrador (Registro.br, GoDaddy, etc) e troca os nameservers pelos da Cloudflare
5. Espera propagação (geralmente ~10 min, pode demorar até 24h)
6. Volta no Cloudflare e confirma que está **Active**

### 5b — Instalar Cloudflare Tunnel no servidor

**No SSH do server:**

```bash
# Detecta arch (vai retornar arm64 no Oracle)
ARCH=$(dpkg --print-architecture)

# Baixa cloudflared
curl -L --output cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb

# Instala
sudo dpkg -i cloudflared.deb

# Confirma
cloudflared --version
```

### 5c — Criar o tunnel

```bash
# Login (vai abrir uma URL — copia e cola no browser do seu Mac, autoriza)
cloudflared tunnel login

# Cria tunnel com nome "zapfire"
cloudflared tunnel create zapfire
# Output:
#   Tunnel credentials written to /home/ubuntu/.cloudflared/<UUID>.json
#   Created tunnel zapfire with id <UUID>
# COPIA esse UUID

# Cria o DNS record automaticamente
cloudflared tunnel route dns zapfire zapfire.seudominio.com
```

### 5d — Configurar o tunnel

```bash
sudo mkdir -p /etc/cloudflared

# Copia o JSON de credentials pra /etc
sudo cp ~/.cloudflared/*.json /etc/cloudflared/

# Cria o config
sudo nano /etc/cloudflared/config.yml
```

Cola o conteúdo abaixo (substitua **TRES** coisas: `UUID-DO-TUNNEL`, `nome-do-arquivo-credentials.json`, `zapfire.seudominio.com`):

```yaml
tunnel: UUID-DO-TUNNEL
credentials-file: /etc/cloudflared/nome-do-arquivo-credentials.json

ingress:
  - hostname: zapfire.seudominio.com
    service: http://localhost:3000
  - service: http_status:404
```

Salva (Ctrl+O, Enter, Ctrl+X).

---

## Etapa 6 — Subir a stack + tunnel (5 min)

```bash
cd /opt/zapfire

# Tira o serviço Caddy do compose (Cloudflare cuida do HTTPS)
nano docker-compose.prod.yml
# Comenta as linhas do bloco `caddy:` inteiro (do "caddy:" até o "networks: - zapfire_net" desse bloco)
# Comenta também `caddy_data:` e `caddy_config:` lá em baixo nos volumes
# Salva
```

> Dica rápida: pra comentar várias linhas no nano, pode ir uma a uma colocando `#` na frente, ou usar `Ctrl+K` pra deletar (mais agressivo, recomendo só comentar).

```bash
# Sobe a stack (vai demorar ~5 min na primeira vez — build da imagem do Next)
docker compose -f docker-compose.prod.yml up -d --build

# Acompanha os logs (Ctrl+C pra sair sem matar nada)
docker compose -f docker-compose.prod.yml logs -f
```

Quando ver `[entrypoint] Subindo Next.js em :3000` e `Ready` no log do `zapfire_app`, está rodando.

```bash
# Testa local primeiro
curl http://localhost:3000/api/health
# Deve retornar: {"ok":true,...}
```

Sobe o tunnel como serviço:

```bash
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
sudo systemctl status cloudflared
# Deve aparecer "active (running)"
```

---

## Etapa 7 — Testa do celular

Abre `https://zapfire.seudominio.com` no celular. Deve carregar o painel do ZapFire.

✅ Pronto. Está no ar.

---

## Etapa 8 — (Recomendado) Login multi-usuário

Sem isso, qualquer pessoa que adivinhar a URL entra no painel. Liga isso antes de compartilhar o link com qualquer pessoa.

1. Cloudflare dash → **Zero Trust** (no menu lateral, procura "Zero Trust")
2. Primeira vez: pede pra criar uma equipe (escolhe um nome qualquer)
3. **Access → Applications → Add an application → Self-hosted**
4. Preenche:
   - Application name: `ZapFire`
   - Session Duration: `24 hours`
   - Application domain: `zapfire.seudominio.com`
5. Em **Identity providers**: deixa **One-time PIN** marcado (manda código por e-mail; sem precisar Google/etc)
6. **Next**
7. **Add a policy:**
   - Policy name: `usuarios-autorizados`
   - Action: `Allow`
   - Configure rules → Include → **Emails** → adiciona seu e-mail e os de quem mais vai usar (até 50 grátis)
8. **Next → Add application**

Pronto. Agora qualquer um que tentar entrar precisa colocar e-mail, recebe um código por e-mail, e só passa se o e-mail estiver autorizado.

---

## Operação do dia-a-dia

### Atualizar o ZapFire (depois que eu mudar código aqui)

**No Mac:**
```bash
cd /Users/thiagolira/Documents/zapfire
tar czf /tmp/zapfire-deploy-$(date +%Y%m%d).tar.gz \
  --exclude='node_modules' --exclude='.next' --exclude='.git' \
  --exclude='prisma/dev.db*' --exclude='*.tar.gz' --exclude='.DS_Store' \
  --exclude='public/uploads' .

scp -i ~/.ssh/oracle-zapfire.key \
  /tmp/zapfire-deploy-*.tar.gz \
  ubuntu@SEU-IP-ORACLE:/opt/zapfire/
```

**No SSH do server:**
```bash
cd /opt/zapfire
# Backup da config local antes de extrair
cp .env /tmp/.env.backup
cp docker-compose.prod.yml /tmp/docker-compose.prod.yml.backup

tar xzf zapfire-deploy-*.tar.gz

# Restaura .env e o compose modificado (sem Caddy)
cp /tmp/.env.backup .env
cp /tmp/docker-compose.prod.yml.backup docker-compose.prod.yml

# Rebuild + restart
docker compose -f docker-compose.prod.yml up -d --build
```

### Logs

```bash
# Tudo
docker compose -f docker-compose.prod.yml logs -f

# Só o ZapFire
docker compose -f docker-compose.prod.yml logs -f zapfire

# Só Evolution
docker compose -f docker-compose.prod.yml logs -f evolution-api

# Tunnel
sudo journalctl -u cloudflared -f
```

### Restart

```bash
docker compose -f docker-compose.prod.yml restart zapfire
sudo systemctl restart cloudflared
```

### Backup (importante!)

Os dados que você não pode perder:
- **Sessões da Evolution** (sem isso, perde os WhatsApps conectados — tem que escanear QR de novo)
- **SQLite do ZapFire** (todos os contatos, listas, campanhas, métricas)
- **Postgres da Evolution** (histórico de mensagens)

```bash
# Faz um backup local no servidor
sudo docker run --rm \
  -v zapfire_zapfire_data:/zapfire \
  -v zapfire_evolution_instances:/evolution \
  -v zapfire_evolution_postgres:/postgres \
  -v $(pwd):/backup \
  alpine tar czf /backup/backup-$(date +%Y%m%d).tar.gz /zapfire /evolution /postgres

# Baixa pro Mac
# (no Mac)
scp -i ~/.ssh/oracle-zapfire.key \
  ubuntu@SEU-IP-ORACLE:/opt/zapfire/backup-*.tar.gz \
  ~/Backups/zapfire/
```

Coloca isso num cron diário no Oracle se quiser automatizar.

---

## Troubleshooting

### "Connection refused" ao testar `https://zapfire.seudominio.com`

1. `sudo systemctl status cloudflared` — está running?
2. `docker compose -f docker-compose.prod.yml ps` — `zapfire_app` está Up?
3. `curl http://localhost:3000` no servidor — responde?
4. DNS já propagou? `dig zapfire.seudominio.com` — deve apontar pra Cloudflare

### "Out of capacity" ao criar VM ARM
Espera 1-2h e tenta de novo. Tenta horários diferentes (madrugada na Europa = bom).

### Tunnel não conecta
- Confere o UUID e o nome do JSON em `/etc/cloudflared/config.yml`
- `sudo journalctl -u cloudflared -n 50` pra ver o erro real

### Chip baniu
- IP de cloud (Oracle) é mais arriscado pra WhatsApp. Use o sistema de **score + drip + blacklist** do ZapFire e vá DEVAGAR no começo.
- Se precisar: proxy residencial (BrightData, Smartproxy) por R$ 30-80/mês resolve.

### Oracle reclama instância?
Free tier exige uso. Se a VM ficar 100% ociosa por dias, pode ser reclamada. Como o ZapFire roda 24/7 (scheduler ticka a cada 30s, Evolution mantém socket), você está protegido.
