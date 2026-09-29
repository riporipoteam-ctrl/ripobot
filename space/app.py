"""RipoBot host for Hugging Face Spaces (free Gradio SDK).

The Space runs `python app.py`. This script:
  1. Downloads a pinned Node.js binary (no root needed).
  2. Downloads the RipoBot code from GitHub.
  3. Installs dependencies and starts the bot as a subprocess.
  4. Serves a tiny Gradio status page on port 7860.

Secrets (DISCORD_TOKEN, CLIENT_ID, GUILD_ID, HF_TOKEN) come from the
environment - set them in the Space's Settings -> Variables and secrets.
"""

import os
import shutil
import subprocess
import tarfile
import threading
import time
import urllib.request
import json

import gradio as gr
import spaces

WORK = "/tmp/ripobot"
NODE_VERSION = "v20.19.0"
NODE_URL = f"https://nodejs.org/dist/{NODE_VERSION}/node-{NODE_VERSION}-linux-x64.tar.xz"
BOT_TARBALL = "https://github.com/riporipoteam-ctrl/ripobot/archive/refs/heads/main.tar.gz"

status = {"line": "starting..."}


@spaces.GPU
def _gpu_placeholder():
    """Satisfies ZeroGPU startup detection; never called."""
    return "ok"


def log(msg):
    print(f"[space] {msg}", flush=True)
    status["line"] = msg


def setup_node():
    node_dir = os.path.join(WORK, "node")
    node_bin = os.path.join(node_dir, "bin", "node")
    if not os.path.exists(node_bin):
        log("downloading Node.js ...")
        os.makedirs(WORK, exist_ok=True)
        tgz = os.path.join(WORK, "node.tar.xz")
        urllib.request.urlretrieve(NODE_URL, tgz)
        with tarfile.open(tgz) as tf:
            tf.extractall(WORK)
        extracted = os.path.join(WORK, f"node-{NODE_VERSION}-linux-x64")
        if os.path.exists(node_dir):
            shutil.rmtree(node_dir)
        os.rename(extracted, node_dir)
        os.remove(tgz)
        log("Node.js ready")
    return node_dir


def github_main_sha():
    """Latest commit SHA of the bot repo's main branch (unauthenticated)."""
    try:
        req = urllib.request.Request(
            "https://api.github.com/repos/riporipoteam-ctrl/ripobot/commits/main",
            headers={"User-Agent": "RipoBot-Space"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode())["sha"]
    except Exception as e:
        print(f"[space] could not check github sha: {e}", flush=True)
        return None


def setup_bot(node_dir):
    bot_dir = os.path.join(WORK, "ripobot-main")
    index_js = os.path.join(bot_dir, "index.js")
    marker = os.path.join(WORK, "bot.sha")
    sha = github_main_sha()
    current = open(marker).read().strip() if os.path.exists(marker) else ""
    # Refresh the bot code whenever GitHub main moved. A stale /tmp would
    # otherwise pin old code forever across container restarts.
    if sha and current == sha and os.path.exists(index_js):
        log(f"bot code up to date ({sha[:7]})")
    else:
        if sha and current and current != sha:
            log(f"bot code stale ({current[:7]} -> {sha[:7]}), refreshing ...")
        if os.path.exists(bot_dir):
            shutil.rmtree(bot_dir)
        log("downloading RipoBot code ...")
        os.makedirs(WORK, exist_ok=True)
        tgz = os.path.join(WORK, "bot.tar.gz")
        urllib.request.urlretrieve(BOT_TARBALL, tgz)
        with tarfile.open(tgz) as tf:
            tf.extractall(WORK)
        os.remove(tgz)
        log("installing dependencies ...")
        env = dict(os.environ)
        env["PATH"] = os.path.join(node_dir, "bin") + os.pathsep + env["PATH"]
        r = subprocess.run(
            ["npm", "ci", "--omit=dev"],
            cwd=bot_dir, env=env, capture_output=True, text=True)
        if r.returncode != 0:
            print(r.stdout[-2000:])
            print(r.stderr[-2000:])
            raise RuntimeError("npm ci failed")
        log("dependencies installed")
        if sha:
            with open(marker, "w") as f:
                f.write(sha)
    # Sentinel: companions must not start until this exists (they used to race
    # npm ci and crash with "Cannot find module 'discord.js'").
    with open(os.path.join(WORK, ".deps_ready"), "w") as f:
        f.write("ok")
    return bot_dir


def run_bot():
    try:
        node_dir = setup_node()
        bot_dir = setup_bot(node_dir)
        node_bin = os.path.join(node_dir, "bin", "node")
        env = dict(os.environ)
        env["PATH"] = os.path.join(node_dir, "bin") + os.pathsep + env["PATH"]
        env["PORT"] = "7861"  # 7860 is taken by the Gradio status page
        log("starting RipoBot ...")
        proc = subprocess.Popen(
            [node_bin, "index.js"], cwd=bot_dir, env=env,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        log(f"RipoBot running (pid {proc.pid}) - waiting for Discord login ...")
        for line in proc.stdout:
            line = line.rstrip()
            print(line, flush=True)
            if "logged in as" in line.lower():
                status["line"] = "online - " + line
        rc = proc.wait()
        log(f"RipoBot exited (code {rc})")
    except Exception as e:
        log(f"failed: {e}")


def run_companion(name, token, vibe):
    """Launch one parameterized companion bot (companions/chatter.js).

    Waits for the shared Node binary + bot dir (with timeout) instead of
    relying on the main bot thread's timing, then starts the companion
    subprocess and streams its stdout prefixed. Companion processes never
    touch the Gradio status line (the main bot owns it) and do NOT set
    PORT (they serve nothing; avoids the EADDRINUSE race).
    """
    prefix = f"[companion:{name}]"
    try:
        node_bin = os.path.join(WORK, "node", "bin", "node")
        deps_ready = os.path.join(WORK, ".deps_ready")
        for _ in range(120):  # ~10 min timeout
            if os.path.exists(node_bin) and os.path.exists(deps_ready):
                break
            time.sleep(5)
        else:
            print(f"[space] {prefix} timed out waiting for node/deps setup", flush=True)
            return
        env = dict(os.environ)
        env["PATH"] = os.path.join(WORK, "node", "bin") + os.pathsep + env["PATH"]
        env["COMPANION_NAME"] = name
        env["COMPANION_TOKEN"] = token
        env["COMPANION_VIBE"] = vibe
        for key in ("RIPOBOT_CHAT_CHANNEL_ID", "GUILD_ID"):
            if key in os.environ:
                env[key] = os.environ[key]
        print(f"[space] starting companion {name} (vibe={vibe}) ...", flush=True)
        proc = subprocess.Popen(
            [node_bin, "companions/chatter.js"], cwd=os.path.join(WORK, "ripobot-main"),
            env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        for line in proc.stdout:
            print(f"{prefix} {line.rstrip()}", flush=True)
        rc = proc.wait()
        print(f"[space] {prefix} exited (code {rc})", flush=True)
    except Exception as e:
        print(f"[space] {prefix} failed: {e}", flush=True)


threading.Thread(target=run_bot, daemon=True).start()

# Companion bots (Bolt + Pip). Tokens live in Space secrets as
# COMPANION1_TOKEN / COMPANION2_TOKEN — never in code.
for _name, _token, _vibe in [
    ("Bolt", os.environ.get("COMPANION1_TOKEN"), "bolt"),
    ("Pip", os.environ.get("COMPANION2_TOKEN"), "pip"),
]:
    if _token:
        threading.Thread(target=run_companion, args=(_name, _token, _vibe), daemon=True).start()
    else:
        print(f"[space] no {_name} token — companion skipped", flush=True)

with gr.Blocks(title="RipoBot") as demo:
    gr.Markdown("# RipoBot\nCustom moderation bot for the Ripo Team Discord server.")
    box = gr.Textbox(label="Status", value="starting...", interactive=False)
    btn = gr.Button("Refresh status")
    btn.click(lambda: status["line"], outputs=box)

demo.launch(server_name="0.0.0.0", server_port=7860)
