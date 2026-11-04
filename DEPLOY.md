# Deploy do ZapFire

Este documento é prático: uma sequência de comandos para subir o painel + Evolution API num servidor Linux. Funciona igual em **Hetzner** (x86_64), **Oracle Cloud Always Free** (ARM64), VPS qualquer ou mini-PC em casa.

> **Antes de começar:** decida se quer **Cloudflare Tunnel** (sem abrir portas, login multi-usuário fácil) ou **Caddy direto** (HTTPS via Let's Encrypt, mais simples se domínio aponta direto pro IP). Os dois caminhos estão documentados aqui.

---

## Pré-requisitos

- Servidor Linux (Ubuntu 22.04+ ou Debian 12+ recomendados)
- SSH funcionando
- Domínio próprio (ex: `seudominio.com`) com DNS gerenciável
- ~5 GB livres em disco, 2 GB de RAM mínimo (4 GB recomendado)

---

## Parte 1 — Provisionar o servidor

### Opção A — Hetzner CX22 (~R$ 28/mês)

1. Cria conta em [hetzner.com/cloud](https://www.hetzner.com/cloud)
2. **Add Server** → CX22 (2 vCPU, 4 GB RAM, 40 GB SSD), location **Helsinki** ou **Falkenstein**
3. **Image:** Ubuntu 22.04
4. **SSH Key:** cola sua chave pública (se não tem, gera com `ssh-keygen`)
5. **Firewall:** cria um e libera portas `22/tcp`, `80/tcp`, `443/tcp` (esta última só se for usar Caddy direto)
6. Cria → anota o IP público

### Opção B — Oracle Cloud Always Free (R$ 0/mês)

1. Cria conta em [oracle.com/cloud/free](https://www.oracle.com/cloud/free/) (precisa cartão pra validar, **não cobra**)
2. **Region:** escolha a mais próxima (São Paulo se aceitar pra free tier; senão Ashburn US-East)
3. **Compute → Create Instance:**
   - Image: Canonical Ubuntu 22.04 (Aarch64)
   - Shape: **VM.Standard.A1.Flex** com **4 OCPU + 24 GB RAM** (free tier permite)
   - Networking: VCN automática
   - SSH: cola sua chave pública
4. Cria → anota o IP público
5. **Liberar portas no firewall do Oracle:**
   - Networking → VCNs → Default Security List → Add Ingress Rule
   - Source: `0.0.0.0/0`, port `80`, depois outra regra pra `443`
6. **No próprio servidor**, libera no `iptables` do Ubuntu (Oracle tem firewall duplo):
   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```

> **Aviso anti-ban:** WhatsApp identifica IPs de datacenter. Chip novo num cloud IP queima mais rápido. Comece com chip já usado e vá devagar; o sistema de score + drip do ZapFire foi feito justamente pra mitigar isso.

---

## Parte 2 — Setup base do servidor

```bash
# Conecta via SSH (substitua o IP)
ssh ubuntu@SEU-IP-AQUI

# Atualiza pacotes
sudo apt update && sudo apt upgrade -y

# Instala Docker + Docker Compose
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# Sai e entra de novo no SSH pra o group pegar
exit
```

Reconecta:

```bash
ssh ubuntu@SEU-IP-AQUI
docker --version          # confirma instalação
docker compose version    # confirma compose v2

# Instala git
sudo apt install -y git

# Cria pasta e clona o projeto (ajuste a URL do seu repo)
sudo mkdir -p /opt/zapfire && sudo chown $USER:$USER /opt/zapfire
cd /opt/zapfire
git clone https://github.com/SEU-USUARIO/zapfire.git .
```

> Se você não usa git, pode tarballar local e copiar com `scp`:
> ```
> tar czf zapfire.tar.gz --exclude=node_modules --exclude=.next --exclude='*.db' .
> scp zapfire.tar.gz ubuntu@SEU-IP:/opt/zapfire/
> ssh ubuntu@SEU-IP "cd /opt/zapfire && tar xzf zapfire.tar.gz"
> ```

---

## Parte 3 — Configurar `.env`

```bash
cd /opt/zapfire
cp .env.production.example .env
nano .env
```

Preencha:

- `DOMAIN`: ex `zapfire.seudominio.com` (mesmo se for usar Cloudflare Tunnel; alguns campos referenciam)
- `ACME_EMAIL`: e-mail real (ouvirá só se cert expirar)
- `EVOLUTION_API_KEY`: gera com `openssl rand -hex 32`
- `POSTGRES_PASSWORD`: gera com `openssl rand -hex 24`

Salva e sai.

---

## Parte 4 — Escolher caminho de HTTPS

### Caminho 1 — Caddy direto (mais simples)

**Quando usar:** servidor com IP público, domínio aponta direto via A record.

1. **DNS:** no painel da sua Cloudflare/registrador, cria um A record:
   ```
   zapfire.seudominio.com  →  A  →  SEU-IP-AQUI  (proxy: DNS only / nuvem cinza)
   ```
   > Importante deixar **DNS only** (cinza) na Cloudflare nesse caminho — Caddy precisa falar direto com Let's Encrypt na porta 80/443. Senão o cert não emite.

2. **Sobe a stack:**
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```

3. **Verifica:**
   ```bash
   docker compose -f docker-compose.prod.yml logs -f caddy
   ```
   Deve aparecer `certificate obtained successfully`. Acesse `https://zapfire.seudominio.com`.

### Caminho 2 — Cloudflare Tunnel (mais robusto, com login)

**Quando usar:** quer login multi-usuário sem código (Cloudflare Access), ou servidor sem IP público (CGNAT, behind NAT, casa).

1. **Habilita Cloudflare** no domínio (gratuito)

2. **Instala cloudflared no servidor:**
   ```bash
   # Detecta arquitetura
   ARCH=$(dpkg --print-architecture)
   curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb
   sudo dpkg -i cloudflared.deb
   ```

3. **Login + cria tunnel:**
   ```bash
   cloudflared tunnel login            # abre URL pra autorizar via browser
   cloudflared tunnel create zapfire   # gera UUID
   cloudflared tunnel route dns zapfire zapfire.seudominio.com
   ```

4. **Configura o tunnel:**
   ```bash
   sudo mkdir -p /etc/cloudflared
   sudo cp ~/.cloudflared/<UUID>.json /etc/cloudflared/
   sudo cp /opt/zapfire/cloudflared/config.example.yml /etc/cloudflared/config.yml
   sudo nano /etc/cloudflared/config.yml
   # Substitua o UUID nos dois lugares e ajuste hostname
   ```

5. **Tira o Caddy do compose** (não precisa mais — Cloudflare cuida do HTTPS):
   ```bash
   nano docker-compose.prod.yml
   # Comente o serviço `caddy:` inteiro (deixa só evolution-api, postgres, redis, zapfire)
   ```

6. **Sobe a stack + tunnel como serviço:**
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   sudo cloudflared service install
   sudo systemctl start cloudflared
   sudo systemctl enable cloudflared
   ```

7. **(Opcional) Liga Cloudflare Access pra exigir login:**
   - Painel Cloudflare → Zero Trust → Access → Applications → Add → Self-hosted
   - Application Domain: `zapfire.seudominio.com`
   - Identity providers: One-Time Pin (e-mail) ou Google
   - Policy: "Emails ending in" `@seudominio.com` ou lista os emails permitidos
   - Save

   Pronto: agora qualquer pessoa que tente entrar é forçada a logar antes de chegar no painel. Até 50 usuários grátis.

---

## Parte 5 — Verificar tudo funcionando

```bash
# Status dos containers
docker compose -f docker-compose.prod.yml ps

# Logs em tempo real
docker compose -f docker-compose.prod.yml logs -f zapfire

# Health check
curl -i https://zapfire.seudominio.com/api/health
# Deve retornar 200 OK
```

Acessa no browser → faz login (se Access estiver ligado) → conecta sua primeira instância WhatsApp.

---

## Parte 6 — Operação do dia-a-dia

### Atualizar o ZapFire (depois de pull / mudar código)

```bash
cd /opt/zapfire
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

A migration roda sozinha no entrypoint do container. SQLite e sessões da Evolution ficam intactos (volumes persistentes).

### Backup

O dado importante mora em 3 volumes Docker:

```bash
# Backup completo
sudo docker run --rm \
  -v zapfire_zapfire_data:/zapfire \
  -v zapfire_evolution_instances:/evolution \
  -v zapfire_evolution_postgres:/postgres \
  -v $(pwd):/backup \
  alpine tar czf /backup/zapfire-backup-$(date +%Y%m%d).tar.gz /zapfire /evolution /postgres
```

Coloca isso num cron diário e copia o tarball pra um S3 / Drive / outro servidor. Sem backup, se queimar a VM perde os números conectados (precisa escanear QR de novo) e o histórico.

### Logs / Debug

```bash
# Logs de um serviço específico
docker compose -f docker-compose.prod.yml logs -f zapfire
docker compose -f docker-compose.prod.yml logs -f evolution-api

# Entrar num container
docker exec -it zapfire_app sh

# Status de saúde
docker stats
```

### Restart

```bash
# Restart soft (sem rebuild)
docker compose -f docker-compose.prod.yml restart zapfire

# Stop tudo
docker compose -f docker-compose.prod.yml down

# Sobe de novo
docker compose -f docker-compose.prod.yml up -d
```

---

## Troubleshooting

### "Cert não emite" no Caddy
- DNS A record realmente aponta pro IP do server? `dig zapfire.seudominio.com`
- Cloudflare em modo "DNS only" (cinza), não proxied (laranja)?
- Portas 80 e 443 abertas no firewall do provedor + iptables do servidor?

### "Cannot connect to Evolution"
- `docker compose -f docker-compose.prod.yml logs evolution-api` — checa se subiu
- A `EVOLUTION_API_KEY` do `.env` é a mesma usada pelo ZapFire? (ela compartilha o mesmo arquivo)

### Performance ruim no Oracle ARM
- Verifique RAM realmente alocada: `free -h`
- Postgres da Evolution pode pesar — considere reduzir `DATABASE_SAVE_DATA_HISTORIC=false` no compose

### Chip baniu logo
- IP de cloud é mais arriscado mesmo. Use o sistema de **score + drip + blacklist** do ZapFire pra não disparar pesado nos primeiros dias
- Considere um proxy residencial pra Evolution (paid; ~R$ 30-80/mês)

---

## Custos esperados

| Setup | Mensal | Notas |
|-------|--------|-------|
| Oracle Cloud Always Free + Cloudflare | **R$ 0** | Funciona, mas Oracle pode reclamar instância ociosa; ARM |
| Hetzner CX22 + Cloudflare | **~R$ 28** | Mais robusto, x86_64, IP melhor reputado |
| Domínio .com | ~R$ 50/ano | Já tem |
| Cloudflare DNS + Tunnel + Access | R$ 0 | Free tier cobre tudo isso |
