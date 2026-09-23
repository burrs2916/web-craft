# ops-web-env-check 脚本跨 Linux 发行版兼容性分析报告

> 分析对象：`src-tauri/src/app/ops_service.rs` 中 `ops-web-env-check` 脚本
> 分析日期：2026-08-21
> 脚本版本：内置预置脚本（Python 完整版 + Bash 降级版）

---

## 一、脚本整体结构

脚本位于 `ops_service.rs` 第 331–1553 行，为单条 bash 脚本，内部包含两套实现：

| 模式 | 触发条件 | 检测能力 | 输出格式 |
|------|---------|---------|---------|
| **Python 完整版** | `python3` 命令可用 | 完整 7 大分组 + 详细子项 | 结构化 JSON |
| **Bash 降级版** | `python3` 不可用 | 核心 7 大分组（部分子项缺失） | 结构化 JSON |

脚本参数：
- `domain`：站点域名（用于 SSL 检测）
- `deploy_path`：部署路径（用于站点服务检测）
- `expected_db`：目标数据库（`none` / `mysql` / `postgresql`）

---

## 二、检测项目完整清单（按分组）

### 2.1 system（系统基础）

| 检测项 | Python 版命令 | Bash 版命令 | 状态分级 |
|--------|--------------|-------------|---------|
| 操作系统 | `lsb_release -d` → `/etc/os-release` | `lsb_release -d` → `/etc/os-release` | info |
| 运行时间 | `uptime -p` → `uptime | awk` | `uptime -p` → `uptime | awk` | info |
| CPU | `/proc/cpuinfo` + `os.cpu_count()` + `os.getloadavg()` | `/proc/cpuinfo` + `nproc` + `/proc/loadavg` | info |
| 内存 | `free -m`（Python 解析） | `free -m`（awk 解析） | pass/warning/fail（70%/85% 阈值） |
| 磁盘（根分区） | `df -h /` | `df -h /` | pass/warning/fail（70%/85% 阈值） |
| Inode | `df -i /` | **缺失** | warning/fail（70%/85% 阈值） |

**Inode 检测仅 Python 版有，Bash 版缺失。**

### 2.2 web（Web 服务）

| 检测项 | Python 版命令 | Bash 版命令 | 状态分级 |
|--------|--------------|-------------|---------|
| Nginx 安装/版本/运行 | `nginx -v 2>&1` + `pgrep -x nginx` | `nginx -v 2>&1` + `pgrep -x nginx` | pass/warning/fail |
| Nginx 配置路径 | `nginx -t 2>&1 \| grep` | **缺失** | — |
| Nginx 站点数 | `ls /etc/nginx/sites-enabled/ \| wc -l` | `ls /etc/nginx/sites-enabled/ \| wc -l` | — |
| Nginx 配置检测 | `sudo nginx -t 2>&1` | `sudo nginx -t 2>&1` | pass/fail/warning |

**Python 版额外输出 Nginx 配置文件路径，Bash 版无此信息。**

### 2.3 database（数据库）

| 检测项 | Python 版命令 | Bash 版命令 | 状态分级 |
|--------|--------------|-------------|---------|
| MySQL/MariaDB 安装/版本/运行 | `mysql -V` 或 `mariadb -V` + `pgrep` | 同 Python 版 | pass/warning/fail |
| MySQL 连接数 | `mysql -u root -e "SHOW GLOBAL STATUS..."` | **缺失** | pass/warning/fail 或 info |
| MySQL 数据目录 | `mysql -u root -e "SHOW VARIABLES LIKE 'datadir'"` + `df -h` | **缺失** | info |
| PostgreSQL 安装/版本/运行 | `psql --version` + `pgrep postgres` | 同 Python 版 | pass/warning/fail |
| PostgreSQL 连接数 | `psql -U postgres -c "SELECT count(*) FROM pg_stat_activity"` | **缺失** | info |
| PostgreSQL 数据目录 | `psql -U postgres -c "SHOW data_directory"` + `df -h` | **缺失** | info |

**数据库详细状态（连接数、数据目录）仅 Python 版提供，Bash 版完全缺失。**

### 2.4 cache（缓存）

| 检测项 | Python 版命令 | Bash 版命令 | 状态分级 |
|--------|--------------|-------------|---------|
| Redis 安装/版本/运行 | `redis-server --version` + `pgrep redis-server` | 同 Python 版 | pass/warning/fail |
| Redis 内存详情 | `redis-cli info all` 解析 | **缺失** | pass/warning/fail 或 info |
| Redis 持久化状态 | `redis-cli info all` 解析 RDB/AOF | **缺失** | pass/warning |
| Redis 连接数 | `redis-cli info all` 解析 | **缺失** | info |

**Redis 详细状态（内存/持久化/连接数）仅 Python 版提供，Bash 版完全缺失。**

### 2.5 ports（端口监听）

| 检测项 | Python 版命令 | Bash 版命令 | 状态分级 |
|--------|--------------|-------------|---------|
| :80 HTTP | `ss -tlnp` → `netstat -tlnp` | 同 Python 版 | pass / info |
| :443 HTTPS | 同上 | 同上 | pass / info |
| :3306 MySQL | 同上 | 同上 | pass / info |
| :5432 PostgreSQL | 同上 | 同上 | pass / info |
| :6379 Redis | 同上 | 同上 | pass / info |
| :3001 webcraft | 同上 | 同上 | pass / info |

**Python 版**额外解析进程名（`users:(("procname"` 正则），**Bash 版**直接用端口名填充 detail。

### 2.6 ssl（SSL 证书）

| 检测项 | Python 版命令 | Bash 版命令 | 状态分级 |
|--------|--------------|-------------|---------|
| 证书有效期 | `openssl s_client` + `openssl x509 -enddate` + Python `datetime` 计算 | `openssl s_client` + `openssl x509 -enddate` + `date -d` 计算 | pass/warning/fail |
| 颁发者 | `openssl x509 -issuer` | 同 Python 版 | info |
| 证书域名 | `openssl x509 -subject` | 同 Python 版 | info |

有效期计算方式不同：Python 用 `datetime.strptime`，Bash 用 `date -d`。

### 2.7 site（站点服务）

| 检测项 | Python 版命令 | Bash 版命令 | 状态分级 |
|--------|--------------|-------------|---------|
| webcraft-server 进程 | `pgrep -x webcraft-server` / `webcraft_server` + 端口检测 | 同 Python 版 | pass/warning/fail |
| 部署路径存在性 | `os.path.isdir()` | `[ -d ]` | pass/fail |
| 部署路径权限/所有者 | `os.stat()` + `pwd` + `grp` 模块 | **缺失** | pass |
| 项目文件标记 | `os.path.isfile()` 检测 package.json/nginx.conf/.env | `[ -f ]` 检测相同文件 | info |
| 项目大小 | `du -sh` | **缺失** | info |
| Nginx 站点配置 | `grep -r domain /etc/nginx/` → `grep -r deploy_path /etc/nginx/` | **缺失** | pass/warning |

**Bash 版缺失：权限所有者、项目大小、Nginx 站点配置搜索。**

---

## 三、跨 Linux 发行版兼容性分析

### 3.1 命令可用性矩阵

下表标注各命令在不同发行版默认安装情况：

| 命令 | Debian/Ubuntu | RHEL/CentOS/Fedora | Arch Linux | Alpine Linux | 问题说明 |
|------|:---:|:---:|:---:|:---:|---------|
| `python3` | ✅ 默认 | ⚠️ 部分版本需手动装 | ✅ 默认 | ❌ 需 apk add | Alpine 默认无 python3，将降级到 bash 模式 |
| `lsb_release` | ⚠️ 部分版本缺失 | ❌ 通常缺失 | ❌ 需安装 | ❌ 需安装 | 多数现代发行版已不预装，脚本有 `/etc/os-release` 降级 |
| `free` | ✅ procps | ✅ procps-ng | ✅ procps-ng | ❌ 需 add procps | Alpine busybox 的 free 输出格式可能不同 |
| `pgrep` | ✅ procps | ✅ procps-ng | ✅ procps-ng | ❌ 需 add procps | Alpine busybox 有 pgrep 但行为可能有差异 |
| `ss` | ✅ iproute2 | ✅ iproute | ✅ iproute2 | ❌ 需 add iproute2 | Alpine 默认无 ss，降级到 netstat |
| `netstat` | ❌ 已弃用 | ⚠️ net-tools | ❌ 已弃用 | ❌ 需 add net-tools | 双降级：ss → netstat → 都没有时检测失败 |
| `nproc` | ✅ coreutils | ✅ coreutils | ✅ coreutils | ⚠️ busybox | Alpine busybox nproc 可能不可用 |
| `sudo` | ✅ 默认 | ✅ 默认 | ✅ 默认 | ⚠️ 需安装 | Alpine 默认可能无 sudo |
| `openssl` | ✅ 默认 | ✅ 默认 | ✅ openssl | ⚠️ 需 add openssl | Alpine 默认可能无 openssl |
| `du` | ✅ coreutils | ✅ coreutils | ✅ coreutils | ✅ busybox | 基本通用 |
| `df` | ✅ coreutils | ✅ coreutils | ✅ coreutils | ✅ busybox | 基本通用 |
| `timeout` | ✅ coreutils | ✅ coreutils | ✅ coreutils | ⚠️ busybox timeout | Alpine busybox timeout 参数可能有差异 |
| `date -d` | ✅ GNU date | ✅ GNU date | ✅ GNU date | ❌ busybox date 不支持 -d | **Bash 版 SSL 有效期计算在 Alpine 上会失败** |

### 3.2 各发行版具体问题

#### Debian / Ubuntu
- **整体兼容性：良好**
- `lsb_release` 在部分最小化安装中可能缺失，但脚本有 `/etc/os-release` 降级
- `python3` 默认安装
- 所有核心命令（free, pgrep, ss, sudo, openssl）均默认可用

#### RHEL / CentOS / Fedora
- **整体兼容性：良好**
- `lsb_release` 通常不预装，但有 `/etc/os-release` 降级
- CentOS 7 上 `python3` 可能需要手动安装（默认是 python2），将降级到 bash 模式
- RHEL 8+/Fedora 默认有 python3
- `netstat` 已弃用，但 `ss` 可用

#### Arch Linux
- **整体兼容性：良好**
- `python3` 默认安装
- `lsb_release` 不预装，但有 `/etc/os-release` 降级
- 所有核心命令均可用

#### Alpine Linux
- **整体兼容性：较差**，存在以下问题：

1. **python3 默认未安装** → 脚本降级到 bash 模式
2. **`free` 命令**：busybox 版 free 输出格式与 GNU 版不同（列数/字段名可能有差异），可能导致内存解析失败
3. **`ss` 命令**：默认不安装 iproute2，降级到 netstat；netstat 也可能未安装，导致端口检测全部失败
4. **`pgrep` 命令**：busybox 版 pgrep 的 `-x` 选项行为可能与 procps-ng 版不一致
5. **`sudo` 命令**：默认可能未安装，`sudo nginx -t` 会失败
6. **`date -d` 选项**：busybox date 不支持 `-d` 参数，**Bash 版 SSL 证书有效期天数计算完全失败**
7. **`timeout` 命令**：busybox timeout 语法可能有差异（`timeout 10 sh -c "cmd"` 可能不工作）
8. **`nproc` 命令**：busybox 版可能不可用，CPU 核数显示为 "?"
9. **`/proc/cpuinfo` 的 `model name` 字段**：在 Alpine 容器中可能不存在

#### 容器环境（通用问题）
- `/proc/cpuinfo` 在某些容器运行时中可能不完整或缺失
- `pgrep` 在容器中可能无法正确检测到主机名进程
- `systemctl` 相关命令（不在 env-check 中，但其他脚本使用）在容器中通常不可用

### 3.3 路径约定问题

| 路径/假设 | 问题发行版 | 说明 |
|----------|-----------|------|
| `/etc/nginx/sites-enabled/` | RHEL/CentOS/Fedora、Arch | 这些发行版的 Nginx 默认配置目录可能是 `/etc/nginx/conf.d/` 而非 `sites-enabled/`，站点数统计恒为 0 |
| `/etc/nginx/` | — | Nginx 配置根目录假设通用，但某些发行版可能不同（如 openSUSE 用 `/etc/nginx/` 但结构不同） |
| `/var/log/nginx/access.log` | — | 其他脚本使用，env-check 中未用但相关脚本有同样问题 |
| `/proc/cpuinfo` | Alpine（某些容器） | model name 字段可能缺失 |
| `/proc/loadavg` | Alpine（某些容器） | 可能不存在或格式不同 |

### 3.4 数据库连接权限问题

| 命令 | 问题 |
|------|------|
| `mysql -u root -e "..."` | 多数发行版（特别是 MySQL 8.0+）要求 root 用户通过 socket 或 sudo 连接，直接 `mysql -u root` 会报 `Access denied`。脚本中 `2>/dev/null` 会静默吞掉错误 |
| `psql -U postgres -c "..."` | 同样需要 `sudo -u postgres psql` 或 peer 认证，直接运行可能失败 |

这是**所有发行版**都存在的问题，不仅仅是跨发行版问题。Python 版中这两个检测失败时会静默跳过（返回空字符串，不添加对应检测项）。

---

## 四、错误处理方式分析

### 4.1 Python 版错误处理

**核心机制：** `run()` 函数

```python
def run(cmd, check_exit=False, timeout=10):
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        if check_exit and r.returncode != 0:
            return None
        return r.stdout.strip()
    except Exception:
        return None
```

特点：
1. **全量 try/except 包裹**：任何异常（超时、命令不存在、权限错误等）都返回 `None`
2. **默认不检查退出码**：`check_exit=False` 为默认值，命令失败但有 stdout 输出时仍返回输出
3. **静默失败**：所有错误都被吞掉，不记录任何日志
4. **超时保护**：默认 10 秒超时，SSL 检测 15 秒

**潜在问题：**
- 命令失败原因不可追溯（权限不足？命令不存在？配置错误？）
- 部分命令即使失败也可能有部分输出，导致解析结果不准确
- `check_service()` 中版本命令失败返回空字符串，但仍标记为 "已安装"（因为 `has_cmd()` 通过了）

### 4.2 Bash 版错误处理

**核心机制：** `run_cmd()` 函数 + `2>/dev/null` 重定向

```bash
run_cmd() {
    timeout 10 sh -c "$1" 2>/dev/null | head -100
}
```

特点：
1. **stderr 全部丢弃**：`2>/dev/null` 使所有错误信息不可见
2. **输出截断**：`head -100` 防止输出过多
3. **无超时错误处理**：`timeout` 命令失败时返回非零退出码，但被管道忽略
4. **空值检查**：大多数检测用 `if [ -n "$VAR" ]` 判断是否成功

**潜在问题：**
- `timeout` 命令本身在 Alpine 上可能不存在或行为不同
- `2>/dev/null` 过度使用，导致排错困难
- Bash 版的 `sudo nginx -t` 没有 stderr 重定向（直接 `$()` 捕获），但输出变量可能为空

### 4.3 前端解析层错误处理

前端 `SiteOpsPanel.tsx` 中：
1. 执行失败（非零退出码）→ 抛出错误，显示错误信息
2. stdout 中找不到 JSON → 抛出 "无法解析检测结果"
3. JSON 解析失败 → 异常捕获，显示错误

**问题：** stderr 中有模式信息 `[env-check] mode=python`，但前端不解析 stderr 用于诊断。

---

## 五、Python 版与 Bash 版一致性对比

### 5.1 功能差异汇总

| 功能分类 | Python 版 | Bash 版 | 差异程度 |
|---------|----------|---------|---------|
| 系统基础 - Inode 检测 | ✅ 有 | ❌ 无 | 缺失 |
| 系统基础 - CPU 信息 | `os.cpu_count()` + `os.getloadavg()` | `nproc` + `/proc/loadavg` | 实现不同，结果一致 |
| Web - Nginx 配置路径 | ✅ 有（nginx -t 解析） | ❌ 无 | 缺失 |
| 数据库 - MySQL 连接数 | ✅ 有 | ❌ 无 | 缺失 |
| 数据库 - MySQL 数据目录 | ✅ 有 | ❌ 无 | 缺失 |
| 数据库 - PG 连接数 | ✅ 有 | ❌ 无 | 缺失 |
| 数据库 - PG 数据目录 | ✅ 有 | ❌ 无 | 缺失 |
| 缓存 - Redis 内存详情 | ✅ 有（使用率+百分比） | ❌ 无 | 缺失 |
| 缓存 - Redis 持久化 | ✅ 有（RDB/AOF 状态） | ❌ 无 | 缺失 |
| 缓存 - Redis 连接数 | ✅ 有 | ❌ 无 | 缺失 |
| 端口 - 进程名解析 | ✅ 有（ss 输出正则） | ❌ 无（用端口名填充） | 信息不足 |
| SSL - 有效期计算 | Python datetime（精确） | `date -d`（GNU 依赖） | **Alpine 上 Bash 版失败** |
| 站点 - 部署路径权限 | ✅ 有（所有者/组/权限位） | ❌ 无（提示用 Python 版） | 缺失 |
| 站点 - 项目大小 | ✅ 有（du -sh） | ❌ 无 | 缺失 |
| 站点 - Nginx 配置搜索 | ✅ 有（grep -r） | ❌ 无 | 缺失 |
| 评分计算 | `int((passed*100 + warning*60) / denom)` | 同公式（整数运算） | 精度有细微差异 |

### 5.2 检测项数量对比

| 分组 | Python 版（约） | Bash 版（约） |
|------|----------------|--------------|
| system | 6 项 | 5 项（缺 Inode） |
| web | 2–3 项 | 2 项（缺配置路径） |
| database | 4–6 项（取决于是否运行） | 2 项（仅基础检测） |
| cache | 3–4 项（取决于是否运行） | 1 项（仅基础检测） |
| ports | 6 项 | 6 项 |
| ssl | 3 项（有域名时） | 3 项（有域名+openssl 时） |
| site | 5–6 项（有部署路径时） | 3–4 项（有部署路径时） |
| **总计** | **约 29–32 项** | **约 22–24 项** |

Bash 版检测项数量约为 Python 版的 **70–75%**，主要缺失数据库和缓存的详细状态。

### 5.3 输出格式一致性

- 顶层结构一致：`summary` + `groups`
- summary 字段一致：`score`, `total`, `passed`, `warning`, `failed`, `info`, `check_mode`
- groups 结构一致：`id`, `name`, `items[]`
- items 结构一致：`name`, `status`, `value`, `detail`
- `check_mode` 字段区分 "python" / "bash"

**前端解析应该能兼容两种模式，但详细程度差异较大。**

---

## 六、问题汇总与修复建议

### 6.1 严重问题（必须修复）

#### 问题 1：Alpine Linux 上 Bash 版 SSL 有效期计算失败
- **原因**：`date -d` 是 GNU date 扩展，busybox date 不支持
- **影响**：Alpine 系统 SSL 证书有效期检测项不显示
- **修复建议**：
  ```bash
  # 方案 A：尝试多种 date 格式
  if date -d "2024-01-01" +%s >/dev/null 2>&1; then
      # GNU date
      END_TS=$(date -d "$ENDDATE" +%s)
  else
      # busybox date -D 指定输入格式
      END_TS=$(date -D "%b %d %H:%M:%S %Y %Z" -d "$ENDDATE" +%s)
  fi
  ```
  方案 B：使用 openssl 直接获取时间戳（更可靠）

#### 问题 2：数据库连接检测静默失败
- **原因**：`mysql -u root` 和 `psql -U postgres` 在大多数现代发行版中因认证方式问题会失败
- **影响**：MySQL/PG 连接数、数据目录等详细检测项不显示，用户误以为"没装"
- **修复建议**：
  ```python
  # MySQL：尝试多种连接方式
  mysql_cmds = [
      "mysql -u root -e 'SELECT 1'",
      "sudo mysql -u root -e 'SELECT 1'",
      "mysql -e 'SELECT 1'",  # 当前用户
  ]
  ```
  或者使用 socket 连接，并将失败原因显示在 detail 中

#### 问题 3：Nginx 站点目录路径假设
- **原因**：假设所有发行版都用 `/etc/nginx/sites-enabled/`
- **影响**：RHEL/CentOS/Fedora/Arch 上站点数恒为 0
- **修复建议**：
  ```python
  # 检查常见的站点配置目录
  site_dirs = ["/etc/nginx/sites-enabled", "/etc/nginx/conf.d", "/etc/nginx/http.d"]
  for d in site_dirs:
      if os.path.isdir(d):
          count = len([f for f in os.listdir(d) if f.endswith('.conf')])
          if count > 0:
              ...
  ```

### 6.2 中等问题（建议修复）

#### 问题 4：Alpine 上 ss/netstat 都可能缺失
- **影响**：端口监听检测全部失败，显示"未监听"
- **修复建议**：
  - 增加第三降级方案：`/proc/net/tcp` 解析（不需要额外命令）
  - 或者在 detail 中提示"ss/netstat 均不可用"

#### 问题 5：free 命令输出格式差异
- **影响**：Alpine busybox free 可能导致内存检测失败
- **修复建议**：
  - 优先从 `/proc/meminfo` 读取（所有 Linux 通用）
  ```python
  with open('/proc/meminfo') as f:
      for line in f:
          if line.startswith('MemTotal:'):
              mem_total = int(line.split()[1]) // 1024  # kB → MB
  ```

#### 问题 6：pgrep -x 在 busybox 上行为差异
- **影响**：进程检测可能不准确
- **修复建议**：
  - 增加 `/proc/*/comm` 文件检查作为降级方案
  - 或者使用 `ps aux | grep` 作为第三方案

#### 问题 7：Inode 检测 Bash 版缺失
- **影响**：Bash 模式下缺少 Inode 使用率检测
- **修复建议**：在 Bash 版中添加 `df -i /` 检测

### 6.3 轻微问题（可选优化）

#### 问题 8：错误信息完全静默
- **影响**：排错困难，用户不知道为什么某项检测不显示
- **修复建议**：
  - 在 detail 字段中显示失败原因（如 "命令超时"、"权限不足"、"未找到命令"）
  - 或者在 debug 模式下输出详细错误到 stderr

#### 问题 9：timeout 命令兼容性
- **影响**：Alpine busybox timeout 参数可能不同
- **修复建议**：检测 timeout 命令类型，使用兼容的调用方式

#### 问题 10：Bash 版 JSON 构建脆弱
- **影响**：特殊字符（引号、反斜杠、换行）可能导致 JSON 解析失败
- **现状**：已有 `json_escape()` 函数，但仅处理了基本转义
- **修复建议**：
  - 使用 `jq`（如果可用）构建 JSON
  - 或者确保所有用户可控输入都经过转义

#### 问题 11：Bash 版 PostgreSQL 检测项前缺逗号
- **位置**：Bash 版第 1285 行（`DB_ITEMS="$DB_ITEMS,`）与 MySQL 项（第 1252 行无逗号）
- **问题**：MySQL 是第一个检测项不加逗号，但 PostgreSQL 前加了逗号。当 MySQL 不检查（`is_db_expected` 返回假）而 PG 检查时，DB_ITEMS 开头会有多余逗号，导致 JSON 语法错误
- **严重程度**：中等（仅在 `expected_db=postgresql` 时触发）

#### 问题 12：Bash 版端口检测项逗号拼接问题
- **位置**：第 1370–1379 行，每个 `check_port` 调用后手动加逗号
- **问题**：最后一个端口（3001）后不加逗号，但前面每个都加了，逻辑正确但容易出错
- **建议**：重构为更稳健的拼接方式

---

## 七、各发行版兼容性评分

| 发行版 | Python 模式评分 | Bash 模式评分 | 整体评价 |
|--------|:---:|:---:|---------|
| Debian 12 / Ubuntu 22.04+ | 95/100 | 85/100 | 优秀 |
| RHEL 9 / Rocky 9 / AlmaLinux 9 | 90/100 | 80/100 | 良好（Nginx 站点路径问题） |
| RHEL 7 / CentOS 7 | 70/100 | 80/100 | 一般（默认无 python3，降级到 bash） |
| Fedora 38+ | 90/100 | 80/100 | 良好 |
| Arch Linux | 95/100 | 85/100 | 优秀（Nginx 站点路径小问题） |
| Alpine 3.18+ | 50/100 | 40/100 | 较差（多项命令缺失，SSL 计算失败） |
| openSUSE | 85/100 | 75/100 | 良好（Nginx 路径可能不同） |

---

## 八、优先级修复路线图

| 优先级 | 修复项 | 影响范围 | 工作量 |
|--------|--------|---------|--------|
| P0 | 修复 Bash 版 PostgreSQL JSON 逗号语法错误 | 所有发行版（expected_db=postgresql 时） | 小 |
| P0 | 修复 Alpine 上 SSL 有效期计算失败 | Alpine + Bash 模式 | 小 |
| P1 | 修复 Nginx 站点目录跨发行版路径问题 | RHEL/CentOS/Fedora/Arch | 中 |
| P1 | 修复数据库连接检测静默失败问题 | 所有发行版 | 中 |
| P1 | 内存检测优先使用 /proc/meminfo | Alpine + 最小化安装 | 小 |
| P2 | 增加端口检测的 /proc/net/tcp 降级方案 | Alpine + 最小化安装 | 中 |
| P2 | Bash 版增加 Inode 检测 | Bash 模式 | 小 |
| P2 | 检测失败时在 detail 中显示原因 | 所有发行版 | 中 |
| P3 | 重构 Bash 版 JSON 拼接逻辑 | 可维护性 | 大 |
| P3 | 增加更多发行版的包管理器/服务管理器检测 | 可扩展性 | 大 |

---

*报告生成时间：2026-08-21*
*分析对象版本：web-craft 当前 HEAD 版本*
