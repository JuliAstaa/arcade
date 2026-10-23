/*
 * Commands for `shell` mode, the ones a homelab runs on: Docker, git,
 * systemd, Tailscale and Proxmox, plus the usual Linux tools. One per line,
 * each ended with enter as if run.
 */

export const commands = [
	'docker compose up -d --build',
	'docker compose logs -f --tail=100 api',
	"docker ps --format '{{.Names}}: {{.Status}}'",
	'docker exec -it postgres psql -U app -d app',
	'docker system prune -af --volumes',
	'docker build -t api:1.4.2 .',
	'docker stats --no-stream',
	'git switch -c feat/typing-test',
	'git log --oneline --graph -n 15',
	'git commit --amend --no-edit',
	'git stash push -m "wip: caret"',
	'git push --force-with-lease',
	'git rebase origin/main',
	'git restore --staged .',
	'systemctl status nginx --no-pager',
	'sudo systemctl restart docker',
	'systemctl list-units --failed',
	'sudo systemctl enable --now node-exporter',
	'journalctl -u tailscaled -f --since "10 min ago"',
	'tailscale status',
	'tailscale ip -4',
	'sudo tailscale up --ssh --advertise-routes=10.0.0.0/24',
	'tailscale ping homelab',
	'tailscale serve --bg 3000',
	'qm list',
	'qm start 101',
	'qm shutdown 104 --timeout 60',
	'qm snapshot 101 pre-upgrade',
	'qm clone 9000 120 --name k3s-node-1 --full',
	'qm set 120 --memory 4096 --cores 2',
	'pct enter 200',
	'vzdump 101 --mode snapshot --storage backup',
	'pvesm status',
	'ssh -L 5432:localhost:5432 db-1',
	'rsync -avz --delete ./dist/ web:/var/www/arcade/',
	'tail -f /var/log/nginx/error.log | grep -i upstream',
	'du -sh /var/lib/docker/* | sort -h',
	'df -h / | tail -1',
	'curl -fsS localhost:8080/healthz',
	'ss -tulpn | grep 5432',
	'psql -h 100.64.0.12 -U app -c "select now()"',
	'redis-cli --scan --pattern "session:*" | wc -l',
];

/** `count` different commands, in random order. */
export const pickCommands = (count: number) => {
	const pool = [...commands];
	for (let i = pool.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[pool[i], pool[j]] = [pool[j], pool[i]];
	}
	return pool.slice(0, count);
};
