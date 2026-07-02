# 🖥️ Home NAS & Docker Environment — specs, current use, and what else it can do

The device that hosts Neuroster on the LAN. This doc captures the **hardware specs**, the
**software/platform** it runs, **how it's been used** (Neuroster's deployment), and **other ways
it could be used**. It's a living reference — update the "As configured" fields with your unit's
actual RAM/drives if they differ.

> **Two kinds of facts below:** *model spec-sheet* values (true of every DS1517+) vs. *as
> configured* values (this specific unit, from the project docs). The latter are marked.

---

## 1. Hardware — Synology DiskStation DS1517+

A 2017 5-bay "Plus"-series prosumer/SMB NAS.

| Spec | Value |
|---|---|
| **CPU** | Intel **Atom C2538** — 4-core / 4-thread @ **2.4 GHz** (64-bit, AES-NI hardware encryption) |
| **RAM** | **DDR3 (SODIMM), dual-channel** — ships as 2 GB or 8 GB, **expandable to 16 GB** |
| **Drive bays** | **5** internal (3.5"/2.5" SATA HDD/SSD) — **expandable to 15** with two **DX517** expansion units (via eSATA) |
| **Max single volume** | ~108 TB (Btrfs, DSM 6.x era; larger on newer DSM/drives) |
| **File systems** | **Btrfs** (snapshots, checksums, self-healing) or ext4 |
| **RAID** | Synology Hybrid RAID (**SHR / SHR-2**), plus **RAID 0/1/5/6/10**, JBOD, Basic |
| **Network** | **4× Gigabit Ethernet** (RJ-45) with **Link Aggregation / failover** |
| **10GbE** | Optional via the **PCIe expansion slot** (add a Synology 10GbE NIC) |
| **External I/O** | **USB 3.0** ports + **2× eSATA** (for the DX517 expansion units) |
| **Encryption** | Hardware **AES-NI** engine (fast encrypted shares/volumes) |

**Practical read:** an efficient, low-power (Atom) always-on box built for **storage, file
serving, backups, and lightweight always-on services** — not a heavy compute or GPU-transcode
machine. Its ceilings are the 4-core Atom CPU and 16 GB RAM.

### As configured (this unit — from the project docs)
| Item | Value | Source |
|---|---|---|
| Model / DSM | **DS1517+**, **DSM 7.1.1** | `DECISIONS.md`, `README.md` |
| LAN address | **`http://192.168.1.90:8080`** | `README.md` |
| Installed RAM | _unknown — fill in (2/8/16 GB)_ | — |
| Drives / RAID | _unknown — fill in_ | — |

---

## 2. Software / platform

| Layer | What's on this unit |
|---|---|
| **OS** | **DSM 7.1.1** (Synology DiskStation Manager — the web-based NAS OS) |
| **Container runtime** | The **legacy "Docker" package** — **not** the newer Container Manager |
| **Compose support** | **None** on the legacy package (its *Container → Add → File* imports a Synology *settings export*, not a `docker-compose.yml`) |
| **File sharing** | SMB (used to mount a Windows share of the repo into the NAS) |
| **Volume FS** | Btrfs/ext4 (snapshots available on Btrfs) |

> ⚠️ **The Compose gap is the one real constraint.** On DSM ≤ 7.1 the legacy Docker package
> can't import a `docker-compose.yml`, so multi-container / declarative stacks must be built
> **by hand** in the DSM Docker UI, or run one container at a time. **DSM 7.2+** replaces this
> with **Container Manager**, which *does* support Compose. See `README.md` → NAS deployment.

---

## 3. How it's been used — Neuroster deployment

The NAS is the LAN host for this game. The deployment is deliberately **build-free and live**.

**Topology:** `GitHub → your PC (auto-pull) → NAS (SMB share) → any browser on the LAN`

- **One hand-built container:** official **`node:*-alpine`** image running **`node /app/server.js`**.
- **Source is bind-mounted read-only at `/app`** from an **SMB-mounted Windows share** of the repo
  — so there's **no build step and no image rebuild**: a `git pull` on the PC changes the files on
  the share, and a **browser refresh** (or the in-game 🔄 Update button) serves the newest committed
  code (the server sends `Cache-Control: no-cache` and reads files fresh per request).
- **Port 8080**, auto-restart on. Health check at `/healthz` → `ok`.
- **Reachable at `http://192.168.1.90:8080`** (game) and `…/docs/project/wall.html` (project board).

**Why this shape:** zero-dependency Node static server + read-only bind mount = the NAS is a dumb,
always-on file server for the app; all the "smarts" (git, CI) live upstream. Trade-off: **the PC
must be on** for the share to serve.

**Documented alternative (PC-independent):** a **prebuilt GHCR image**
`ghcr.io/newellnarco/neuroster-` — pull-and-run one container, no SMB share, no cloning on the box.
And `docker-compose.nas.yml` is ready for a **Container Manager (DSM 7.2+)** box.

---

## 4. Other ways it could be used

This is a capable 5-bay Btrfs NAS with an always-on low-power CPU and a container runtime. Realistic
uses, tiered by how well they fit the Atom/16 GB envelope:

### 🟢 Great fit (what this box is built for)
- **Central file server / NAS** — SMB/AFP/NFS shares, Btrfs **snapshots** + self-healing, quotas.
- **Backup hub** — **Hyper Backup** (versioned backups to another NAS / cloud / USB), **Active Backup
  for Business** (agentless PC/server/VM image backups), **Snapshot Replication**, Time Machine target.
- **Personal cloud** — **Synology Drive** (Dropbox-style sync + file history), **Synology Photos**
  (photo library with albums/sharing).
- **More always-on containers** (one at a time on legacy Docker): Pi-hole/AdGuard (network ad-block +
  local DNS), a Git server (Gitea), Uptime-Kuma monitoring, a small web app, a static site,
  Vaultwarden (self-hosted password manager), Home Assistant (home automation) — all light enough
  for the Atom.
- **Download/automation** — Download Station (torrents/NZB/HTTP), scheduled tasks & cron.
- **Surveillance** — **Surveillance Station** (IP-camera NVR; a couple of cameras are comfortable).
- **VPN into home** — Synology **VPN Server** (WireGuard via community pkg / OpenVPN) or reverse proxy
  + DDNS for secure remote access to the above.

### 🟡 Possible, mind the limits
- **Media server** — Plex/Jellyfin/Emby: fine for **direct-play** and light 1080p; the Atom C2538 has
  **no GPU/QuickSync**, so **heavy or multi-stream transcoding will struggle** — plan for direct-play.
- **Databases / self-hosted apps** (Nextcloud, a small Postgres/MariaDB, a wiki) — workable for a
  household/small team; watch the 16 GB RAM ceiling if you stack several.
- **Small container stacks** — doable, but **without Compose on legacy Docker** you wire multi-container
  apps by hand; upgrading to Container Manager (7.2+) makes this much nicer.

### 🔴 Poor fit (wrong tool)
- **GPU/AI workloads, video encoding farms, heavy CI runners, big VMs** — the Atom CPU and RAM ceiling
  make these a bad match. Push that compute to a desktop/server or the cloud; keep the NAS for storage
  and always-on light services.

---

## 5. Expansion & upgrade paths

- **RAM → 16 GB** (biggest single quality-of-life bump if you run several containers/apps).
- **10 GbE** NIC in the **PCIe slot** (only worth it with SSDs / link-aggregated clients).
- **SSD read/write cache** (M.2 via an adapter card, or 2.5" SSDs in bays) to speed random I/O.
- **Bays 5 → 15** with **DX517** expansion units over eSATA.
- **DSM upgrade** — if a newer DSM is supported on this model, moving to **Container Manager** unlocks
  Docker **Compose** and removes the one-container-at-a-time friction. (Check Synology's compatibility
  for the DS1517+ before upgrading; verify your backups first.)

---

## 6. Caveats / things to watch

- **Legacy Docker = no Compose** (see §2) — the main friction for containerized projects on this unit.
- **Atom CPU / 16 GB ceiling** — great for storage + light always-on services; not for transcoding or
  heavy compute.
- **PC-dependency (current Neuroster setup)** — the SMB-share deployment needs the PC on; use the GHCR
  image route for a fully independent always-on container.
- **Model age (2017) & DSM lifecycle** — keep DSM patched; track Synology's end-of-support timeline and
  keep verified backups (Btrfs snapshots + an off-box Hyper Backup copy).

---

## Sources

- [Synology DS1517+ Datasheet (PDF)](https://global.download.synology.com/download/Document/Hardware/DataSheet/DiskStation/17-year/DS1517+/enu/Synology_DS1517_Plus_Data_Sheet_enu.pdf)
- [StorageReview — DS1517+ NAS Review](https://www.storagereview.com/review/synology-diskstation-ds1517-nas-review)
- [TechRadar — DS1517+ review](https://www.techradar.com/reviews/synology-diskstation-ds1517)
- [SmallNetBuilder — DS1517+ reviewed](https://www.smallnetbuilder.com/nas/nas-reviews/synology-ds1517-diskstation-reviewed/)
- Project docs: [`README.md`](../README.md) (NAS deployment) · [`DECISIONS.md`](../DECISIONS.md) (why no-compose)
