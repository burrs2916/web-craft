#!/bin/bash
# Web 环境检测脚本 - 支持 python3 完整版和 bash 降级版
# 自动检测 python3 是否可用，优先使用完整版，否则降级到 bash 版本

DOMAIN="{{domain}}"
DEPLOY_PATH="{{deploy_path}}"
ENV_CHECK_MODE=""

# 检测 python3 是否可用
if command -v python3 >/dev/null 2>&1; then
    ENV_CHECK_MODE="python"
else
    ENV_CHECK_MODE="bash"
fi

# 输出模式信息到 stderr（不影响 JSON 输出）
echo "[env-check] mode=$ENV_CHECK_MODE" >&2

if [ "$ENV_CHECK_MODE" = "python" ]; then
    # ===== Python 完整版 =====
    python3 <<'PYEOF'
import json, os, subprocess, shutil, platform, sys
from datetime import datetime, timezone

DOMAIN = "{{domain}}" if "{{domain}}" else ""
DEPLOY_PATH = "{{deploy_path}}" if "{{deploy_path}}" else ""

def run(cmd, check_exit=False, timeout=10):
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        if check_exit and r.returncode != 0:
            return None
        return r.stdout.strip()
    except Exception:
        return None

def has_cmd(name):
    return shutil.which(name) is not None

def pgrep(name):
    return subprocess.call(f"pgrep -x {name} >/dev/null 2>&1", shell=True) == 0

def check_service(cmd_name, proc_name, version_cmd, version_extract):
    installed = has_cmd(cmd_name)
    if not installed:
        return {"status": "fail", "value": "未安装", "detail": ""}
    ver_out = run(version_cmd) or ""
    version = ""
    if ver_out and version_extract:
        import re
        m = re.search(version_extract, ver_out)
        if m:
            version = m.group(1)
    if not version and ver_out:
        version = ver_out.split()[0] if ver_out.split() else ver_out[:30]
    running = pgrep(proc_name)
    status = "pass" if running else "warning"
    return {
        "status": status,
        "value": f"{version} · {'运行中' if running else '未运行'}",
        "detail": ""
    }

groups = []

# ========== 1. 系统基础 ==========
system_items = []

# OS
os_name = "Unknown"
if has_cmd("lsb_release"):
    os_name = run("lsb_release -d 2>/dev/null | cut -f2") or os_name
elif os.path.exists("/etc/os-release"):
    r = run("cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d '\"'")
    if r: os_name = r
kernel = platform.release()
arch = platform.machine()
system_items.append({
    "name": "操作系统",
    "status": "info",
    "value": os_name,
    "detail": f"Kernel {kernel} · {arch}"
})

# Uptime
uptime_str = run("uptime -p 2>/dev/null || uptime | awk -F\"up \" \"{print $2}\" | awk -F\",\" \"{print $1}\"")
if uptime_str:
    system_items.append({
        "name": "运行时间",
        "status": "info",
        "value": uptime_str.strip(),
        "detail": ""
    })

# CPU
cpu_model = run("grep 'model name' /proc/cpuinfo 2>/dev/null | head -1 | cut -d: -f2 | xargs") or ""
cpu_count = os.cpu_count() or 0
loadavg = os.getloadavg() if hasattr(os, "getloadavg") else (0, 0, 0)
system_items.append({
    "name": "CPU",
    "status": "info",
    "value": f"{cpu_count} 核 · load {loadavg[0]:.2f}",
    "detail": cpu_model[:50] if cpu_model else ""
})

# Memory
mem_total = mem_used = mem_free = swap_total = swap_used = 0
if has_cmd("free"):
    r = run("free -m")
    if r:
        lines = r.split("\n")
        for line in lines:
            parts = line.split()
            if parts and parts[0] == "Mem:":
                mem_total = int(parts[1]) if len(parts) > 1 else 0
                mem_used = int(parts[2]) if len(parts) > 2 else 0
                mem_free = int(parts[3]) if len(parts) > 3 else 0
            if parts and parts[0] == "Swap:":
                swap_total = int(parts[1]) if len(parts) > 1 else 0
                swap_used = int(parts[2]) if len(parts) > 2 else 0

if mem_total > 0:
    pct = (mem_used / mem_total) * 100
    status = "pass" if pct < 70 else ("warning" if pct < 85 else "fail")
    detail = f"Swap: {swap_used}M / {swap_total}M" if swap_total > 0 else ""
    system_items.append({
        "name": "内存",
        "status": status,
        "value": f"{mem_used}M / {mem_total}M ({pct:.0f}%)",
        "detail": detail
    })

# Disk
df_r = run("df -h / 2>/dev/null | tail -1")
if df_r:
    parts = df_r.split()
    if len(parts) >= 5:
        total = parts[1]
        used = parts[2]
        avail = parts[3]
        pct_str = parts[4].rstrip("%")
        try:
            pct = int(pct_str)
            status = "pass" if pct < 70 else ("warning" if pct < 85 else "fail")
            system_items.append({
                "name": "磁盘 (根分区)",
                "status": status,
                "value": f"{used} / {total} ({pct}%)",
                "detail": f"剩余 {avail}"
            })
        except ValueError:
            pass

# Inode
inode_r = run("df -i / 2>/dev/null | tail -1")
if inode_r:
    parts = inode_r.split()
    if len(parts) >= 5:
        pct_str = parts[4].rstrip("%")
        try:
            pct = int(pct_str)
            if pct > 70:
                status = "warning" if pct < 85 else "fail"
                system_items.append({
                    "name": "Inode",
                    "status": status,
                    "value": f"已用 {pct}%",
                    "detail": ""
                })
        except ValueError:
            pass

groups.append({"id": "system", "name": "系统基础", "items": system_items})

# ========== 2. Web 服务 ==========
web_items = []

# Nginx
nginx = check_service("nginx", "nginx", "nginx -v 2>&1", r"nginx/([\d.]+)")
if nginx["status"] != "fail":
    conf_path = run("nginx -t 2>&1 | grep 'configuration file' | head -1 | awk \"{print \\$5}\"") or ""
    # 同时统计 sites-enabled（Debian/Ubuntu 风格）和 conf.d（RHEL/CentOS/Arch 风格）
    sites_se = run("ls /etc/nginx/sites-enabled/ 2>/dev/null | grep -v '^default$' | wc -l") or "0"
    sites_cd = run("ls /etc/nginx/conf.d/ 2>/dev/null | grep -E '\\.(conf|conf\\.disabled)$' | wc -l") or "0"
    sites_total = int(sites_se.strip() or 0) + int(sites_cd.strip() or 0)
    detail = ""
    if conf_path: detail += f"配置: {conf_path}"
    if sites_total > 0:
        detail += f" · {sites_total} 个站点"
    nginx["detail"] = detail
web_items.append({"name": "Nginx", **nginx})

# Nginx 配置正确性检测
if has_cmd("nginx"):
    nginx_test = run("sudo nginx -t 2>&1", timeout=15)
    if nginx_test:
        if "test is successful" in nginx_test or "syntax is ok" in nginx_test:
            web_items.append({
                "name": "Nginx 配置检测",
                "status": "pass",
                "value": "配置正确",
                "detail": "nginx -t 检测通过"
            })
        else:
            err_lines = [l for l in nginx_test.split("\n") if "emerg" in l.lower() or "error" in l.lower()][:2]
            web_items.append({
                "name": "Nginx 配置检测",
                "status": "fail",
                "value": "配置错误",
                "detail": " | ".join(err_lines) if err_lines else nginx_test[:80]
            })
    else:
        web_items.append({
            "name": "Nginx 配置检测",
            "status": "warning",
            "value": "无法检测",
            "detail": "nginx -t 执行失败，可能需要 sudo 权限"
        })

groups.append({"id": "web", "name": "Web 服务", "items": web_items})

# ========== 3. 端口监听 ==========
port_items = []
common_ports = [
    (80, "HTTP"),
    (443, "HTTPS"),
]

ss_available = has_cmd("ss")
for port, name in common_ports:
    if ss_available:
        r = run(f"ss -tlnp 2>/dev/null | grep -E \":{port}\\b\" | head -1")
    else:
        r = run(f"netstat -tlnp 2>/dev/null | grep -E \":{port}\\b\" | head -1")
    
    if r and r.strip():
        import re
        proc_match = re.search(r'users:\(\("([^"]+)"', r)
        proc = proc_match.group(1) if proc_match else name
        port_items.append({
            "name": f":{port} ({name})",
            "status": "pass",
            "value": "监听中",
            "detail": proc
        })
    else:
        port_items.append({
            "name": f":{port} ({name})",
            "status": "info",
            "value": "未监听",
            "detail": ""
        })

groups.append({"id": "ports", "name": "端口监听", "items": port_items})

# ========== 4. 运行时依赖 ==========
runtime_items = []

# OpenSSL（运行时需要，用于 HTTPS 请求）
openssl_ver = run("openssl version 2>/dev/null")
if openssl_ver:
    import re
    ssl_v = ""
    m = re.search(r'OpenSSL ([\d.]+)', openssl_ver)
    if m: ssl_v = m.group(1)
    if not ssl_v: ssl_v = openssl_ver.split()[1] if len(openssl_ver.split()) > 1 else ""
    runtime_items.append({
        "name": "OpenSSL",
        "status": "pass",
        "value": ssl_v,
        "detail": "HTTPS 请求需要"
    })
else:
    runtime_items.append({
        "name": "OpenSSL",
        "status": "fail",
        "value": "未安装",
        "detail": "HTTPS 请求需要"
    })

if runtime_items:
    groups.append({"id": "runtime", "name": "运行时依赖", "items": runtime_items})

# ========== 7. SSL 证书 ==========
if DOMAIN:
    ssl_items = []
    
    cert_cmd = f"echo | openssl s_client -servername {DOMAIN} -connect {DOMAIN}:443 2>/dev/null"
    cert_raw = run(cert_cmd, timeout=15)
    
    if cert_raw and "BEGIN CERTIFICATE" in cert_raw:
        # 提取 PEM 证书部分（从 BEGIN 到 END），避免把 s_client 的其他输出传给 x509
        import re
        pem_match = re.search(r'-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----', cert_raw, re.DOTALL)
        pem_cert = pem_match.group(0) if pem_match else cert_raw
        
        # 用临时文件方式传递证书，避免 shell 管道 + 多行内容导致的解析问题
        import tempfile, os
        tmpf = None
        try:
            tmpf = tempfile.NamedTemporaryFile(mode='w', suffix='.pem', delete=False)
            tmpf.write(pem_cert)
            tmpf.close()
            tmp_path = tmpf.name
            
            enddate = run(f"openssl x509 -in {tmp_path} -noout -enddate 2>/dev/null | cut -d= -f2")
            issuer = run(f"openssl x509 -in {tmp_path} -noout -issuer 2>/dev/null | sed 's/.*CN[[:space:]]*=[[:space:]]*//' | sed 's/,.*//'")
            subject = run(f"openssl x509 -in {tmp_path} -noout -subject 2>/dev/null | sed 's/.*CN[[:space:]]*=[[:space:]]*//' | sed 's/,.*//'")
            # 同时取 SAN（Subject Alternative Name），很多证书 CN 是空的或不完整
            san = run(f"openssl x509 -in {tmp_path} -noout -ext subjectAltName 2>/dev/null | tail -1 | tr -d ' '")
        finally:
            if tmpf and os.path.exists(tmp_path):
                os.unlink(tmp_path)
        
        if enddate:
            try:
                end_dt = datetime.strptime(enddate.strip(), "%b %d %H:%M:%S %Y %Z")
                now = datetime.now()
                days_left = (end_dt - now).days
                
                if days_left > 30:
                    ssl_status = "pass"
                elif days_left > 7:
                    ssl_status = "warning"
                else:
                    ssl_status = "fail"
                
                ssl_items.append({
                    "name": "证书有效期",
                    "status": ssl_status,
                    "value": f"剩余 {days_left} 天",
                    "detail": f"到期: {enddate.strip()[:20]}"
                })
            except Exception:
                ssl_items.append({
                    "name": "证书有效期",
                    "status": "info",
                    "value": enddate.strip()[:30],
                    "detail": ""
                })
        
        if issuer:
            issuer_clean = issuer.strip()
            ssl_items.append({
                "name": "颁发者",
                "status": "info",
                "value": issuer_clean[:40],
                "detail": ""
            })
        
        # 域名优先用 SAN，SAN 没有再用 CN
        domain_value = ""
        if san and "DNS:" in san:
            # 取第一个 DNS 域名，如果有多个在 detail 里展示
            dns_names = [d.strip() for d in san.replace("DNS:", "").split(",") if d.strip()]
            if dns_names:
                domain_value = dns_names[0]
                detail = f"共 {len(dns_names)} 个域名: {', '.join(dns_names[:5])}"
                if len(dns_names) > 5:
                    detail += f" 等 {len(dns_names)} 个"
                ssl_items.append({
                    "name": "证书域名",
                    "status": "info",
                    "value": domain_value,
                    "detail": detail
                })
        elif subject:
            ssl_items.append({
                "name": "证书域名",
                "status": "info",
                "value": subject.strip(),
                "detail": ""
            })
        
        if not ssl_items:
            ssl_items.append({
                "name": "SSL 证书",
                "status": "info",
                "value": "已获取",
                "detail": "证书存在但无法解析详情"
            })
    else:
        ssl_items.append({
            "name": "SSL 证书",
            "status": "fail",
            "value": "无法获取",
            "detail": f"无法连接 {DOMAIN}:443 或证书不存在"
        })
    
    if ssl_items:
        groups.append({"id": "ssl", "name": "SSL 证书", "items": ssl_items})

# ========== 8. DNS 解析 ==========
dns_items = []

if DOMAIN:
    # 获取服务器公网 IP
    server_ip = run("curl -s4 --connect-timeout 5 ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}'") or ""

    # DNS 解析（五级降级：dig → host → nslookup → getent → socket）
    resolved_ip = ""
    if has_cmd("dig"):
        resolved_ip = run("dig +short \"%s\" A 2>/dev/null | grep -E '^[0-9]+\\.' | head -1" % DOMAIN) or ""
    if not resolved_ip and has_cmd("host"):
        r = run("host -t A \"%s\" 2>/dev/null | grep 'has address' | head -1" % DOMAIN)
        if r:
            parts = r.split()
            resolved_ip = parts[-1] if parts else ""
    if not resolved_ip and has_cmd("nslookup"):
        r = run("nslookup \"%s\" 2>/dev/null | grep -E '^Address:?\\s' | grep -v '#' | tail -1" % DOMAIN)
        if r:
            parts = r.split()
            resolved_ip = parts[-1] if parts else ""
    if not resolved_ip and has_cmd("getent"):
        r = run("getent hosts \"%s\" 2>/dev/null | awk '{print $1}' | grep -E '^[0-9]+\\.' | head -1" % DOMAIN)
        if r:
            resolved_ip = r.strip()
    if not resolved_ip:
        # Python socket 作为最终 fallback（无需外部命令）
        import socket as _socket
        try:
            resolved_ip = _socket.gethostbyname(DOMAIN)
        except Exception:
            pass

    if resolved_ip:
        if server_ip and resolved_ip == server_ip:
            dns_items.append({
                "name": f"DNS 解析 ({DOMAIN})",
                "status": "pass",
                "value": f"解析到 {resolved_ip}",
                "detail": f"与服务器 IP {server_ip} 匹配"
            })
        elif server_ip:
            dns_items.append({
                "name": f"DNS 解析 ({DOMAIN})",
                "status": "warning",
                "value": f"解析到 {resolved_ip}",
                "detail": f"与服务器 IP {server_ip} 不匹配（如使用 CDN 属正常）"
            })
        else:
            dns_items.append({
                "name": f"DNS 解析 ({DOMAIN})",
                "status": "warning",
                "value": f"解析到 {resolved_ip}",
                "detail": "无法获取服务器公网 IP 进行比对"
            })
    else:
        dns_items.append({
            "name": f"DNS 解析 ({DOMAIN})",
            "status": "fail",
            "value": "无法解析",
            "detail": "DNS A 记录未配置或域名未注册"
        })
else:
    dns_items.append({
        "name": "DNS 解析",
        "status": "info",
        "value": "未绑定域名",
        "detail": "部署后仅可通过服务器 IP 访问"
    })

groups.append({"id": "dns", "name": "DNS 解析", "items": dns_items})

# ========== 计算汇总 ==========
total = 0
passed = 0
warning = 0
failed = 0
info = 0

for g in groups:
    for item in g["items"]:
        total += 1
        s = item["status"]
        if s == "pass": passed += 1
        elif s == "warning": warning += 1
        elif s == "fail": failed += 1
        elif s == "info": info += 1

score_denom = passed + warning + failed
score = int(((passed * 100 + warning * 60) / score_denom)) if score_denom > 0 else 0

result = {
    "summary": {
        "score": score,
        "total": total,
        "passed": passed,
        "warning": warning,
        "failed": failed,
        "info": info,
        "check_mode": "python"
    },
    "groups": groups
}

print(json.dumps(result, ensure_ascii=False))
PYEOF
else
    # ===== Bash 降级版 =====
    # 覆盖核心检测项：系统基础、Web服务、端口监听、SSL证书
    
    # JSON 构建辅助函数
    json_escape() {
        echo "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\n/\\n/g; s/\r/\\r/g; s/\t/\\t/g'
    }
    
    # 检测命令是否存在
    has_cmd() {
        command -v "$1" >/dev/null 2>&1
    }
    
    # 检测进程是否运行
    pgrep_name() {
        pgrep -x "$1" >/dev/null 2>&1
    }
    
    # 安全运行命令
    run_cmd() {
        timeout 10 sh -c "$1" 2>/dev/null | head -100
    }
    
    TOTAL=0
    PASSED=0
    WARNING=0
    FAILED=0
    INFO_COUNT=0
    
    GROUPS_JSON=""
    
    # ========== 1. 系统基础 ==========
    SYSTEM_ITEMS=""
    
    # OS
    OS_NAME="Unknown"
    if has_cmd lsb_release; then
        OS_NAME=$(lsb_release -d 2>/dev/null | cut -f2 | sed 's/^[[:space:]]*//')
    elif [ -f /etc/os-release ]; then
        OS_NAME=$(grep PRETTY_NAME /etc/os-release | cut -d= -f2 | tr -d '"')
    fi
    KERNEL=$(uname -r)
    ARCH=$(uname -m)
    OS_NAME_ESC=$(json_escape "$OS_NAME")
    KERNEL_ESC=$(json_escape "$KERNEL")
    SYSTEM_ITEMS="$SYSTEM_ITEMS
    {\"name\":\"操作系统\",\"status\":\"info\",\"value\":\"$OS_NAME_ESC\",\"detail\":\"Kernel $KERNEL_ESC · $ARCH\"}"
    TOTAL=$((TOTAL + 1))
    INFO_COUNT=$((INFO_COUNT + 1))
    
    # Uptime
    UPTIME_STR=$(uptime -p 2>/dev/null || uptime | awk -F"up " '{print $2}' | awk -F"," '{print $1}')
    if [ -n "$UPTIME_STR" ]; then
        UPTIME_ESC=$(json_escape "$UPTIME_STR")
        SYSTEM_ITEMS="$SYSTEM_ITEMS,
    {\"name\":\"运行时间\",\"status\":\"info\",\"value\":\"$UPTIME_ESC\",\"detail\":\"\"}"
        TOTAL=$((TOTAL + 1))
        INFO_COUNT=$((INFO_COUNT + 1))
    fi
    
    # CPU
    CPU_COUNT=$(nproc 2>/dev/null || echo "?")
    LOAD_AVG=$(cat /proc/loadavg 2>/dev/null | awk '{print $1}')
    CPU_MODEL=$(grep 'model name' /proc/cpuinfo 2>/dev/null | head -1 | cut -d: -f2 | sed 's/^[[:space:]]*//')
    CPU_MODEL_SHORT=$(echo "$CPU_MODEL" | cut -c1-50)
    CPU_MODEL_ESC=$(json_escape "$CPU_MODEL_SHORT")
    SYSTEM_ITEMS="$SYSTEM_ITEMS,
    {\"name\":\"CPU\",\"status\":\"info\",\"value\":\"$CPU_COUNT 核 · load $LOAD_AVG\",\"detail\":\"$CPU_MODEL_ESC\"}"
    TOTAL=$((TOTAL + 1))
    INFO_COUNT=$((INFO_COUNT + 1))
    
    # Memory
    if has_cmd free; then
        MEM_INFO=$(free -m 2>/dev/null)
        MEM_TOTAL=$(echo "$MEM_INFO" | awk '/^Mem:/ {print $2}')
        MEM_USED=$(echo "$MEM_INFO" | awk '/^Mem:/ {print $3}')
        SWAP_TOTAL=$(echo "$MEM_INFO" | awk '/^Swap:/ {print $2}')
        SWAP_USED=$(echo "$MEM_INFO" | awk '/^Swap:/ {print $3}')
        if [ -n "$MEM_TOTAL" ] && [ "$MEM_TOTAL" -gt 0 ] 2>/dev/null; then
            MEM_PCT=$((MEM_USED * 100 / MEM_TOTAL))
            if [ "$MEM_PCT" -lt 70 ]; then
                MEM_STATUS="pass"
                PASSED=$((PASSED + 1))
            elif [ "$MEM_PCT" -lt 85 ]; then
                MEM_STATUS="warning"
                WARNING=$((WARNING + 1))
            else
                MEM_STATUS="fail"
                FAILED=$((FAILED + 1))
            fi
            SWAP_DETAIL=""
            if [ -n "$SWAP_TOTAL" ] && [ "$SWAP_TOTAL" -gt 0 ] 2>/dev/null; then
                SWAP_DETAIL="Swap: ${SWAP_USED}M / ${SWAP_TOTAL}M"
            fi
            SWAP_DETAIL_ESC=$(json_escape "$SWAP_DETAIL")
            SYSTEM_ITEMS="$SYSTEM_ITEMS,
    {\"name\":\"内存\",\"status\":\"$MEM_STATUS\",\"value\":\"${MEM_USED}M / ${MEM_TOTAL}M (${MEM_PCT}%)\",\"detail\":\"$SWAP_DETAIL_ESC\"}"
            TOTAL=$((TOTAL + 1))
        fi
    fi
    
    # Disk
    DF_INFO=$(df -h / 2>/dev/null | tail -1)
    if [ -n "$DF_INFO" ]; then
        DISK_TOTAL=$(echo "$DF_INFO" | awk '{print $2}')
        DISK_USED=$(echo "$DF_INFO" | awk '{print $3}')
        DISK_AVAIL=$(echo "$DF_INFO" | awk '{print $4}')
        DISK_PCT=$(echo "$DF_INFO" | awk '{print $5}' | tr -d '%')
        if [ -n "$DISK_PCT" ] && [ "$DISK_PCT" -ge 0 ] 2>/dev/null; then
            if [ "$DISK_PCT" -lt 70 ]; then
                DISK_STATUS="pass"
                PASSED=$((PASSED + 1))
            elif [ "$DISK_PCT" -lt 85 ]; then
                DISK_STATUS="warning"
                WARNING=$((WARNING + 1))
            else
                DISK_STATUS="fail"
                FAILED=$((FAILED + 1))
            fi
            SYSTEM_ITEMS="$SYSTEM_ITEMS,
    {\"name\":\"磁盘 (根分区)\",\"status\":\"$DISK_STATUS\",\"value\":\"$DISK_USED / $DISK_TOTAL ($DISK_PCT%)\",\"detail\":\"剩余 $DISK_AVAIL\"}"
            TOTAL=$((TOTAL + 1))
        fi
    fi
    
    # 添加系统组
    GROUPS_JSON="$GROUPS_JSON
  {\"id\":\"system\",\"name\":\"系统基础\",\"items\":[$SYSTEM_ITEMS
  ]}"
    
    # ========== 2. Web 服务 ==========
    WEB_ITEMS=""
    
    # Nginx
    if has_cmd nginx; then
        NGINX_VER=$(nginx -v 2>&1 | grep -oE 'nginx/[0-9.]+' | head -1 | sed 's/nginx\///')
        if [ -z "$NGINX_VER" ]; then
            NGINX_VER="unknown"
        fi
        if pgrep_name nginx; then
            NGINX_STATUS="pass"
            NGINX_VALUE="$NGINX_VER · 运行中"
            PASSED=$((PASSED + 1))
        else
            NGINX_STATUS="warning"
            NGINX_VALUE="$NGINX_VER · 未运行"
            WARNING=$((WARNING + 1))
        fi
        NGINX_DETAIL=""
        # 同时统计 sites-enabled（Debian/Ubuntu 风格）和 conf.d（RHEL/CentOS/Arch 风格）
        SITES_SE=$(ls /etc/nginx/sites-enabled/ 2>/dev/null | grep -v '^default$' | wc -l)
        SITES_CD=$(ls /etc/nginx/conf.d/ 2>/dev/null | grep -E '\.(conf|conf\.disabled)$' | wc -l)
        SITES_COUNT=$((SITES_SE + SITES_CD))
        if [ "$SITES_COUNT" -gt 0 ] 2>/dev/null; then
            NGINX_DETAIL="$SITES_COUNT 个站点"
        fi
        NGINX_DETAIL_ESC=$(json_escape "$NGINX_DETAIL")
        WEB_ITEMS="$WEB_ITEMS
    {\"name\":\"Nginx\",\"status\":\"$NGINX_STATUS\",\"value\":\"$NGINX_VALUE\",\"detail\":\"$NGINX_DETAIL_ESC\"}"
        TOTAL=$((TOTAL + 1))
        
        # Nginx 配置检测
        NGINX_TEST=$(sudo nginx -t 2>&1)
        if echo "$NGINX_TEST" | grep -qiE "(test is successful|syntax is ok)"; then
            WEB_ITEMS="$WEB_ITEMS,
    {\"name\":\"Nginx 配置检测\",\"status\":\"pass\",\"value\":\"配置正确\",\"detail\":\"nginx -t 检测通过\"}"
            PASSED=$((PASSED + 1))
        elif [ -n "$NGINX_TEST" ]; then
            NGINX_ERR=$(echo "$NGINX_TEST" | grep -iE "(emerg|error)" | head -2 | tr '\n' ' ' | cut -c1-80)
            NGINX_ERR_ESC=$(json_escape "$NGINX_ERR")
            WEB_ITEMS="$WEB_ITEMS,
    {\"name\":\"Nginx 配置检测\",\"status\":\"fail\",\"value\":\"配置错误\",\"detail\":\"$NGINX_ERR_ESC\"}"
            FAILED=$((FAILED + 1))
        else
            WEB_ITEMS="$WEB_ITEMS,
    {\"name\":\"Nginx 配置检测\",\"status\":\"warning\",\"value\":\"无法检测\",\"detail\":\"nginx -t 执行失败，可能需要 sudo 权限\"}"
            WARNING=$((WARNING + 1))
        fi
        TOTAL=$((TOTAL + 1))
    else
        WEB_ITEMS="$WEB_ITEMS
    {\"name\":\"Nginx\",\"status\":\"fail\",\"value\":\"未安装\",\"detail\":\"\"}"
        FAILED=$((FAILED + 1))
        TOTAL=$((TOTAL + 1))
    fi
    
    # 添加 Web 组
    if [ -n "$WEB_ITEMS" ]; then
        if [ -n "$GROUPS_JSON" ]; then
            GROUPS_JSON="$GROUPS_JSON,"
        fi
        GROUPS_JSON="$GROUPS_JSON
  {\"id\":\"web\",\"name\":\"Web 服务\",\"items\":[$WEB_ITEMS
  ]}"
    fi
    
    # ========== 3. 端口监听 ==========
    PORT_ITEMS=""
    
    check_port() {
        local port=$1
        local name=$2
        local result=""
        if has_cmd ss; then
            result=$(ss -tlnp 2>/dev/null | grep -E ":${port}[[:space:]]" | head -1)
        elif has_cmd netstat; then
            result=$(netstat -tlnp 2>/dev/null | grep -E ":${port}[[:space:]]" | head -1)
        fi
        if [ -n "$result" ]; then
            PORT_ITEMS="$PORT_ITEMS
    {\"name\":\":${port} (${name})\",\"status\":\"pass\",\"value\":\"监听中\",\"detail\":\"${name}\"}"
            PASSED=$((PASSED + 1))
        else
            PORT_ITEMS="$PORT_ITEMS
    {\"name\":\":${port} (${name})\",\"status\":\"info\",\"value\":\"未监听\",\"detail\":\"\"}"
            INFO_COUNT=$((INFO_COUNT + 1))
        fi
        TOTAL=$((TOTAL + 1))
    }
    
    check_port 80 "HTTP"
    PORT_ITEMS="$PORT_ITEMS,"
    check_port 443 "HTTPS"
    
    # 添加端口组
    if [ -n "$GROUPS_JSON" ]; then
        GROUPS_JSON="$GROUPS_JSON,"
    fi
    GROUPS_JSON="$GROUPS_JSON
  {\"id\":\"ports\",\"name\":\"端口监听\",\"items\":[$PORT_ITEMS
  ]}"

    # ========== 4. SSL 证书 ==========
    if [ -n "$DOMAIN" ] && has_cmd openssl; then
        SSL_ITEMS=""
        CERT_RAW=$(echo | timeout 15 openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null)
        
        if echo "$CERT_RAW" | grep -q "BEGIN CERTIFICATE"; then
            # 提取 PEM 证书到临时文件，避免管道传多行内容出问题
            CERT_TMP=$(mktemp /tmp/webcraft-cert-XXXXXX.pem 2>/dev/null)
            if [ -n "$CERT_TMP" ]; then
                echo "$CERT_RAW" | sed -n '/-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/p' > "$CERT_TMP"
                
                ENDDATE=$(openssl x509 -in "$CERT_TMP" -noout -enddate 2>/dev/null | cut -d= -f2)
                ISSUER=$(openssl x509 -in "$CERT_TMP" -noout -issuer 2>/dev/null | sed -E 's/.*CN[[:space:]]*=[[:space:]]*//' | sed 's/,.*//')
                SUBJECT=$(openssl x509 -in "$CERT_TMP" -noout -subject 2>/dev/null | sed -E 's/.*CN[[:space:]]*=[[:space:]]*//' | sed 's/,.*//')
                SAN=$(openssl x509 -in "$CERT_TMP" -noout -ext subjectAltName 2>/dev/null | tail -1 | tr -d ' ')
                
                rm -f "$CERT_TMP"
            else
                # 降级：直接管道
                ENDDATE=$(echo "$CERT_RAW" | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
                ISSUER=$(echo "$CERT_RAW" | openssl x509 -noout -issuer 2>/dev/null | sed -E 's/.*CN[[:space:]]*=[[:space:]]*//' | sed 's/,.*//')
                SUBJECT=$(echo "$CERT_RAW" | openssl x509 -noout -subject 2>/dev/null | sed -E 's/.*CN[[:space:]]*=[[:space:]]*//' | sed 's/,.*//')
                SAN=""
            fi
            
            if [ -n "$ENDDATE" ]; then
                # 简单计算剩余天数（bash 方式，精度稍低但可用）
                END_TS=$(date -d "$ENDDATE" +%s 2>/dev/null)
                NOW_TS=$(date +%s)
                if [ -n "$END_TS" ] && [ "$END_TS" -gt 0 ] 2>/dev/null; then
                    DAYS_LEFT=$(( (END_TS - NOW_TS) / 86400 ))
                    if [ "$DAYS_LEFT" -gt 30 ]; then
                        SSL_STATUS="pass"
                        PASSED=$((PASSED + 1))
                    elif [ "$DAYS_LEFT" -gt 7 ]; then
                        SSL_STATUS="warning"
                        WARNING=$((WARNING + 1))
                    else
                        SSL_STATUS="fail"
                        FAILED=$((FAILED + 1))
                    fi
                    ENDDATE_SHORT=$(echo "$ENDDATE" | cut -c1-20)
                    ENDDATE_ESC=$(json_escape "$ENDDATE_SHORT")
                    SSL_ITEMS="$SSL_ITEMS
    {\"name\":\"证书有效期\",\"status\":\"$SSL_STATUS\",\"value\":\"剩余 ${DAYS_LEFT} 天\",\"detail\":\"到期: $ENDDATE_ESC\"}"
                    TOTAL=$((TOTAL + 1))
                fi
            fi
            
            if [ -n "$ISSUER" ]; then
                ISSUER_SHORT=$(echo "$ISSUER" | cut -c1-40)
                ISSUER_ESC=$(json_escape "$ISSUER_SHORT")
                SSL_ITEMS="$SSL_ITEMS,
    {\"name\":\"颁发者\",\"status\":\"info\",\"value\":\"$ISSUER_ESC\",\"detail\":\"\"}"
                TOTAL=$((TOTAL + 1))
                INFO_COUNT=$((INFO_COUNT + 1))
            fi
            
            # 域名优先用 SAN，没有再用 CN
            if [ -n "$SAN" ] && echo "$SAN" | grep -q "DNS:"; then
                # 取第一个 DNS 域名
                FIRST_DOMAIN=$(echo "$SAN" | sed 's/DNS://g' | tr ',' '\n' | head -1 | tr -d ' ')
                DNS_COUNT=$(echo "$SAN" | grep -o "DNS:" | wc -l)
                if [ -n "$FIRST_DOMAIN" ]; then
                    DOMAIN_ESC=$(json_escape "$FIRST_DOMAIN")
                    DOMAIN_DETAIL="共 ${DNS_COUNT} 个域名"
                    DETAIL_ESC=$(json_escape "$DOMAIN_DETAIL")
                    SSL_ITEMS="$SSL_ITEMS,
    {\"name\":\"证书域名\",\"status\":\"info\",\"value\":\"$DOMAIN_ESC\",\"detail\":\"$DETAIL_ESC\"}"
                    TOTAL=$((TOTAL + 1))
                    INFO_COUNT=$((INFO_COUNT + 1))
                fi
            elif [ -n "$SUBJECT" ]; then
                SUBJECT_ESC=$(json_escape "$SUBJECT")
                SSL_ITEMS="$SSL_ITEMS,
    {\"name\":\"证书域名\",\"status\":\"info\",\"value\":\"$SUBJECT_ESC\",\"detail\":\"\"}"
                TOTAL=$((TOTAL + 1))
                INFO_COUNT=$((INFO_COUNT + 1))
            fi
        else
            DOMAIN_ESC=$(json_escape "$DOMAIN")
            SSL_ITEMS="$SSL_ITEMS
    {\"name\":\"SSL 证书\",\"status\":\"fail\",\"value\":\"无法获取\",\"detail\":\"无法连接 ${DOMAIN_ESC}:443 或证书不存在\"}"
            FAILED=$((FAILED + 1))
            TOTAL=$((TOTAL + 1))
        fi
        
        if [ -n "$SSL_ITEMS" ]; then
            if [ -n "$GROUPS_JSON" ]; then
                GROUPS_JSON="$GROUPS_JSON,"
            fi
            GROUPS_JSON="$GROUPS_JSON
  {\"id\":\"ssl\",\"name\":\"SSL 证书\",\"items\":[$SSL_ITEMS
  ]}"
        fi
    fi
    
    # ========== 5. DNS 解析 ==========
    DNS_ITEMS=""
    if [ -n "$DOMAIN" ]; then
        # 获取服务器公网 IP
        SERVER_IP=$(curl -s4 --connect-timeout 5 ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "")
        
        # DNS 解析（五级降级：dig → host → nslookup → getent → python3 socket）
        RESOLVED_IP=""
        if command -v dig >/dev/null 2>&1; then
            RESOLVED_IP=$(dig +short "$DOMAIN" A 2>/dev/null | grep -E '^[0-9]+\.' | head -1)
        fi
        if [ -z "$RESOLVED_IP" ] && command -v host >/dev/null 2>&1; then
            RESOLVED_IP=$(host -t A "$DOMAIN" 2>/dev/null | grep "has address" | head -1 | awk '{print $NF}')
        fi
        if [ -z "$RESOLVED_IP" ] && command -v nslookup >/dev/null 2>&1; then
            RESOLVED_IP=$(nslookup "$DOMAIN" 2>/dev/null | grep -E "^Address:?\s" | grep -v '#' | tail -1 | awk '{print $NF}')
        fi
        if [ -z "$RESOLVED_IP" ] && command -v getent >/dev/null 2>&1; then
            RESOLVED_IP=$(getent hosts "$DOMAIN" 2>/dev/null | awk '{print $1}' | grep -E '^[0-9]+\.' | head -1)
        fi
        if [ -z "$RESOLVED_IP" ] && command -v python3 >/dev/null 2>&1; then
            RESOLVED_IP=$(python3 -c "import socket,sys; print(socket.gethostbyname(sys.argv[1]))" "$DOMAIN" 2>/dev/null)
        fi
        
        DOMAIN_ESC=$(json_escape "$DOMAIN")
        if [ -n "$RESOLVED_IP" ]; then
            if [ -n "$SERVER_IP" ] && [ "$RESOLVED_IP" = "$SERVER_IP" ]; then
                DNS_ITEMS="{\"name\":\"DNS 解析 ($DOMAIN_ESC)\",\"status\":\"pass\",\"value\":\"解析到 $RESOLVED_IP\",\"detail\":\"与服务器 IP $SERVER_IP 匹配\"}"
                PASSED=$((PASSED + 1))
            elif [ -n "$SERVER_IP" ]; then
                DNS_ITEMS="{\"name\":\"DNS 解析 ($DOMAIN_ESC)\",\"status\":\"warning\",\"value\":\"解析到 $RESOLVED_IP\",\"detail\":\"与服务器 IP $SERVER_IP 不匹配（如使用 CDN 属正常）\"}"
                WARNING=$((WARNING + 1))
            else
                DNS_ITEMS="{\"name\":\"DNS 解析 ($DOMAIN_ESC)\",\"status\":\"warning\",\"value\":\"解析到 $RESOLVED_IP\",\"detail\":\"无法获取服务器公网 IP 进行比对\"}"
                WARNING=$((WARNING + 1))
            fi
        else
            DNS_ITEMS="{\"name\":\"DNS 解析 ($DOMAIN_ESC)\",\"status\":\"fail\",\"value\":\"无法解析\",\"detail\":\"DNS A 记录未配置或域名未注册\"}"
            FAILED=$((FAILED + 1))
        fi
        TOTAL=$((TOTAL + 1))
    else
        DNS_ITEMS="{\"name\":\"DNS 解析\",\"status\":\"info\",\"value\":\"未绑定域名\",\"detail\":\"部署后仅可通过服务器 IP 访问\"}"
        INFO_COUNT=$((INFO_COUNT + 1))
        TOTAL=$((TOTAL + 1))
    fi
    
    if [ -n "$DNS_ITEMS" ]; then
        if [ -n "$GROUPS_JSON" ]; then
            GROUPS_JSON="$GROUPS_JSON,"
        fi
        GROUPS_JSON="$GROUPS_JSON
  {\"id\":\"dns\",\"name\":\"DNS 解析\",\"items\":[$DNS_ITEMS
  ]}"
    fi
    
    # ========== 计算汇总 ==========
    SCORE_DENOM=$((PASSED + WARNING + FAILED))
    if [ "$SCORE_DENOM" -gt 0 ]; then
        SCORE=$(( (PASSED * 100 + WARNING * 60) / SCORE_DENOM ))
    else
        SCORE=0
    fi
    
    # 输出最终 JSON
    cat <<JSONEOF
{"summary":{"score":$SCORE,"total":$TOTAL,"passed":$PASSED,"warning":$WARNING,"failed":$FAILED,"info":$INFO_COUNT,"check_mode":"bash"},"groups":[$GROUPS_JSON
]}
JSONEOF
fi
