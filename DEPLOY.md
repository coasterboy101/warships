## Deployment

The site runs on its own DigitalOcean droplet (Debian 13 "trixie", 64-bit). Everything the droplet needs is in `deploy/`:

| File | Purpose |
| --- | --- |
| `deploy/nginx.conf` | Nginx site for `warships.dillrellis.com`: reverse proxies to `127.0.0.1:3000`, gzips responses, and sets cache headers (`/assets/` cached forever, everything else revalidated) |
| `deploy/warships.service` | systemd unit that runs `npm start`, which serves `dist/` on `127.0.0.1:3000` |
| `deploy/deploy.sh` | Pulls a branch, runs `npm ci` and `npm run build`, and restarts the service |

Requests flow: browser -> Nginx (ports 80/443, TLS) -> Node (`sirv`, loopback port 3000) -> `dist/`.

Only `main` is deployed. There are no automatic deploys, branch deploys, or pull request previews; a release goes live when you run the deploy script.

### Deploying a release

Merge `dev` into `main`, push, then on the droplet:

```sh
ssh root@<droplet-ip> /srv/warships/deploy/deploy.sh
```

The script discards any local changes in `/srv/warships` and resets it to `origin/main`. Pass a branch name as an argument to deploy something else, for example `deploy.sh dev`.

### Droplet dependencies

All of these must be installed on the droplet before the first deploy.

| Dependency | Debian package | Needed for |
| --- | --- | --- |
| Nginx | `nginx` | Reverse proxy and TLS termination |
| Node.js 22 or newer, with npm | none; installed with [NVM](https://github.com/nvm-sh/nvm) | Building the site (`npm ci`, `npm run build`) and running the server (`npm start`). Debian 13's own `nodejs` package is Node 20, which is too old |
| Git | `git` | Cloning the repository and pulling releases |
| curl and CA certificates | `curl`, `ca-certificates` | Downloading NVM and Node |
| Certbot with the Nginx plugin | `certbot`, `python3-certbot-nginx` | Issuing and renewing the Let's Encrypt certificate |
| ufw (optional) | `ufw` | Firewall, if you are not using a DigitalOcean cloud firewall |

systemd and `runuser` (from `util-linux`) are also required and are part of every Debian install. The npm packages, including the `sirv-cli` static server, are installed by `npm ci` during each deploy.

`npm ci` and the build (`tsc` and Vite) can run out of memory on the smallest (512 MB) droplet. Use a 1 GB droplet or add swap.

### One-time droplet setup

Run as root on a fresh Debian 13 droplet.

1. Install the dependencies:

   ```sh
   apt update
   apt install -y nginx git curl ca-certificates certbot python3-certbot-nginx ufw
   ```

2. Install NVM system-wide in `/usr/local/nvm`, use it to install Node 22, and link `node`, `npm` and `npx` into `/usr/local/bin`:

   ```sh
   export NVM_DIR=/usr/local/nvm
   mkdir -p "$NVM_DIR"
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
   . "$NVM_DIR/nvm.sh"
   nvm install 22
   nvm alias default 22
   NODE_BIN="$(dirname "$(nvm which 22)")"
   ln -sf "$NODE_BIN/node" "$NODE_BIN/npm" "$NODE_BIN/npx" /usr/local/bin/
   node --version   # must print v22 or newer
   ```

   NVM normally installs into the current user's home directory, but the service user's home is the repository checkout, and NVM only works in shells that source `nvm.sh`. Installing it in `/usr/local/nvm` and linking the binaries into `/usr/local/bin` puts Node on the `PATH` for root, for `deploy.sh` (which runs npm as the service user) and for the systemd unit (which runs `/usr/local/bin/npm`). The installer also adds NVM to root's `~/.bashrc`, so `nvm` is available in later root shells.

3. Create the service user and clone the repository into `/srv/warships`:

   ```sh
   useradd --system --user-group --home-dir /srv/warships --shell /usr/sbin/nologin warships
   install -d -o warships -g warships /srv/warships
   runuser -u warships -- git clone https://github.com/coasterboy101/warships.git /srv/warships
   ```

   The HTTPS clone only works while the GitHub repository is public. If it is private, add a read-only deploy key for the `warships` user and clone over SSH instead.

4. Install the systemd unit and run the first deploy, which builds the site and starts the server:

   ```sh
   cp /srv/warships/deploy/warships.service /etc/systemd/system/
   systemctl daemon-reload
   systemctl enable warships
   /srv/warships/deploy/deploy.sh
   curl -I http://127.0.0.1:3000/   # expect HTTP/1.1 200 OK
   ```

5. Enable the Nginx site:

   ```sh
   cp /srv/warships/deploy/nginx.conf /etc/nginx/sites-available/warships.dillrellis.com
   sudo ln -s /etc/nginx/sites-available/warships.dillrellis.com /etc/nginx/sites-enabled/
   sudo rm /etc/nginx/sites-enabled/default
   nginx -t && systemctl reload nginx
   ```

6. Open the firewall:

   ```sh
   ufw allow 22/tcp
   ufw allow 80/tcp
   ufw allow 443/tcp
   ufw enable
   ```

7. Point the `A` record for `warships.dillrellis.com` at the droplet's IP address. Once it resolves, get the certificate:

   ```sh
   certbot --nginx -d warships.dillrellis.com
   ```

   Certbot adds the HTTPS server block and the HTTP-to-HTTPS redirect to `/etc/nginx/sites-available/warships.dillrellis.com` and renews the certificate automatically.

If `deploy/nginx.conf` or `deploy/warships.service` changes later, copy it to the droplet again as in steps 4 and 5. Copying `nginx.conf` over the installed file removes Certbot's additions, so rerun the `certbot --nginx` command afterwards.

### Upgrading Node

The links in `/usr/local/bin` point at one specific Node version, so after installing a new one with NVM, relink them and redeploy. As root:

```sh
nvm install 22            # or a newer major version
nvm alias default 22
NODE_BIN="$(dirname "$(nvm which default)")"
ln -sf "$NODE_BIN/node" "$NODE_BIN/npm" "$NODE_BIN/npx" /usr/local/bin/
/srv/warships/deploy/deploy.sh
```

`nvm uninstall <version>` removes an old version once nothing links to it.

### Troubleshooting

```sh
systemctl status warships     # is the Node server running?
journalctl -u warships -n 50  # its logs
nginx -t                      # is the Nginx config valid?
tail /var/log/nginx/error.log # a 502 here means the Node server is down
```
