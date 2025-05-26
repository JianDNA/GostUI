#!/bin/bash

# ========== 环境准备 ========== #
function prepare_environment() {
    echo "🔍 正在检查 Gost 安装状态..."
    if ! command -v gost >/dev/null 2>&1; then
        echo "⚙️ 未检测到 gost，正在安装..."
        bash <(curl -fsSL https://github.com/go-gost/gost/raw/master/install.sh) --install || {
            echo "❌ 安装失败，请检查网络。"
            exit 1
        }
    fi
    echo "✅ Gost 安装完成"

    mkdir -p /etc/gost
    # 修正：创建正确格式的初始配置文件
    if [[ ! -f /etc/gost/config.yml ]]; then
        cat > /etc/gost/config.yml <<EOF
services:
EOF
    fi

    SERVICE_FILE="/etc/systemd/system/gost.service"
    if [[ ! -f "$SERVICE_FILE" ]]; then
        cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Gost Forward Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/etc/gost
ExecStart=/usr/local/bin/gost -C /etc/gost/config.yml
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF
        systemctl daemon-reload
        systemctl enable gost
        echo "✅ Systemd 服务已配置并启用"
    fi
}

# ========== 配色 ========== #
COLOR_RESET=$(tput sgr0)
COLOR_RED=$(tput setaf 1)
COLOR_GREEN=$(tput setaf 2)
COLOR_YELLOW=$(tput setaf 3)
COLOR_CYAN=$(tput setaf 6)
BOLD=$(tput bold)

print_title() { echo "${BOLD}${COLOR_CYAN}==> $1${COLOR_RESET}"; }
print_success() { echo "${COLOR_GREEN}[✔] $1${COLOR_RESET}"; }
print_warning() { echo "${COLOR_YELLOW}[!] $1${COLOR_RESET}"; }
print_error() { echo "${COLOR_RED}[✘] $1${COLOR_RESET}"; }

# ========== 工具函数 ========== #
CONFIG_FILE="/etc/gost/config.yml"
PORT_RANGE_START=20250
PORT_RANGE_END=20260

# 检查并安装依赖
install_python3() {
    print_warning "系统未安装 Python3，是否安装？[Y/n]: "
    read confirm
    if [[ ! "$confirm" =~ ^[Nn]$ ]]; then
        echo -e "${COLOR_CYAN}正在安装 Python3...${COLOR_RESET}"
        if command -v apt-get &>/dev/null; then
            # Debian/Ubuntu
            apt-get update && apt-get install -y python3 || return 1
        elif command -v yum &>/dev/null; then
            # CentOS/RHEL
            yum install -y python3 || return 1
        elif command -v dnf &>/dev/null; then
            # Newer Fedora/CentOS
            dnf install -y python3 || return 1
        else
            print_error "无法确定包管理器，请手动安装 Python3"
            return 1
        fi
        print_success "Python3 安装完成"
        return 0
    fi
    return 1
}

install_pyyaml() {
    print_warning "系统未安装 PyYAML 模块，是否安装？[Y/n]: "
    read confirm
    if [[ ! "$confirm" =~ ^[Nn]$ ]]; then
        echo -e "${COLOR_CYAN}正在安装 PyYAML...${COLOR_RESET}"
        if command -v apt-get &>/dev/null; then
            # Debian/Ubuntu
            apt-get update && apt-get install -y python3-yaml || return 1
        elif command -v yum &>/dev/null; then
            # CentOS/RHEL
            yum install -y python3-pyyaml || return 1
        elif command -v dnf &>/dev/null; then
            # Newer Fedora/CentOS
            dnf install -y python3-pyyaml || return 1
        elif command -v pip3 &>/dev/null; then
            # 尝试使用pip安装
            pip3 install pyyaml || return 1
        else
            print_error "无法确定安装方法，请手动安装 PyYAML"
            return 1
        fi
        print_success "PyYAML 安装完成"
        return 0
    fi
    return 1
}

# 检查 gost 服务状态
is_gost_running() {
    if systemctl is-active --quiet gost.service; then
        return 0  # 服务正在运行
    else
        return 1  # 服务未运行
    fi
}

# 判断进程是否为 gost
is_process_gost() {
    local pid="$1"
    [[ -n "$pid" ]] && ps -p "$pid" -o comm= 2>/dev/null | grep -q "gost"
}

# 检查地址是否是本地地址
is_local_address() {
    local addr="$1"
    [[ -z "$addr" || "$addr" == "localhost" || "$addr" =~ ^127\. || "$addr" == "::1" ]]
}

# 检查特定地址上的端口是否可用
is_port_available_on_addr() {
    local addr="$1"
    local port="$2"
    
    # 如果是本地地址，检查端口占用
    if is_local_address "$addr"; then
        if ss -tuln | grep -q ":$port "; then
            # 获取占用端口的程序
            local pid_info=$(ss -tulnp | grep ":$port " | grep -oP "pid=\K\d+" | head -1)
            
            # 如果是 gost 本身占用的端口且服务在运行，要考虑我们是在修改现有配置
            if is_process_gost "$pid_info" && is_gost_running; then
                local current_config=$(cat "$CONFIG_FILE")
                
                # 如果我们要修改正在使用的端口，可以忽略占用
                if echo "$current_config" | grep -q "addr:.*:$port"; then
                    return 0
                fi
            fi
            
            # 显示占用情况
            if [[ -n "$pid_info" ]]; then
                local process_name=$(ps -p $pid_info -o comm= 2>/dev/null || echo "未知进程")
                print_error "端口 $port 已被进程 $process_name (PID: $pid_info) 占用"
            else
                print_error "端口 $port 已被占用"
            fi
            return 1
        fi
    fi
    
    # 端口未被占用或是非本地地址
    return 0
}

get_random_port() {
    for ((p = PORT_RANGE_START; p <= PORT_RANGE_END; p++)); do
        if is_port_available_on_addr "" "$p"; then
            echo "$p"
            return
        fi
    done
    echo ""
}

validate_ip() {
    [[ $1 =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] && return 0
    [[ $1 =~ ^([a-fA-F0-9:]+)$ ]] && return 0
    return 1
}

# 获取服务列表，只显示顶级服务名称
get_service_names() {
    # 使用特定的模式匹配顶级服务，避免匹配到forwarder.nodes下的name
    awk '/^services:/,0 {
        if($0 ~ /^- name: /) {
            gsub(/^- name: /, "");
            print NR ":" $0;
        }
    }' "$CONFIG_FILE"
}

# 检查服务名是否存在
service_exists() {
    local name="$1"
    grep -q "^- name: $name$" "$CONFIG_FILE"
}

# 解析指定名称服务的配置信息 - 修正版本
get_service_config() {
    local name="$1"
    local service_line=$(grep -n "^- name: $name$" "$CONFIG_FILE" | cut -d: -f1)
    
    if [[ -z "$service_line" ]]; then
        return 1
    fi
    
    # 提取addr行
    local addr_line=$(awk -v start="$service_line" 'NR==start+1 {print $0}' "$CONFIG_FILE")
    local addr=$(echo "$addr_line" | sed -E 's/.*addr: (.*)/\1/')
    
    # 提取type行
    local type_line=$(awk -v start="$service_line" 'NR==start+3 {print $0}' "$CONFIG_FILE")
    local type=$(echo "$type_line" | sed -E 's/.*type: (.*)/\1/')
    
    # 提取完整的目标地址
    local target_line=$(grep -A 9 "^- name: $name$" "$CONFIG_FILE" | grep -m 1 "      addr:" | sed -E 's/.*addr: (.*)/\1/')
    
    # 解析监听地址和端口
    local listen_addr=""
    local listen_port=""
    
    if [[ "$addr" == :* ]]; then
        # 格式是 :端口
        listen_port="${addr:1}"
    else
        # 格式是 地址:端口
        listen_addr="${addr%:*}"
        listen_port="${addr##*:}"
    fi
    
    # 输出提取的信息
    echo "name=$name"
    echo "listen_addr=$listen_addr"
    echo "listen_port=$listen_port"
    echo "protocol=$type"
    echo "target_addr=$target_line"
}

# 分析验证结果，确定是错误还是警告
analyze_validation_result() {
    local result="$1"
    local only_gost_port_warnings=1
    
    # 检查是否存在非gost端口占用问题
    if echo "$result" | grep -q "address already in use"; then
        # 获取所有提到的端口
        local ports=$(echo "$result" | grep -oP "listen \S+ :(\d+)" | grep -oP "\d+" || 
                      echo "$result" | grep -oP ":(\d+): bind" | grep -oP "\d+")
        
        for port in $ports; do
            local pid_info=$(ss -tulnp | grep -w ":$port " | grep -oP "pid=\K\d+" | head -1)
            if ! is_process_gost "$pid_info"; then
                # 存在非gost进程占用的端口
                only_gost_port_warnings=0
                break
            fi
        done
    else
        # 有其他类型的错误
        only_gost_port_warnings=0
    fi
    
    if [[ $only_gost_port_warnings -eq 1 ]]; then
        echo "only_warnings"
    else
        echo "has_errors"
    fi
}

# 解析gost错误输出，展示更友好的错误信息 - 修复版支持多端口
parse_gost_error() {
    local error_output="$1"
    
    # 清理输出，删除调试信息和时间戳
    local cleaned_output=$(echo "$error_output" | grep -v "level.*debug" | sed 's/{".*"time":"[^"]*"}//')
    
    echo -e "\n${COLOR_YELLOW}◆ 详细信息:${COLOR_RESET}"
    
    if echo "$error_output" | grep -q "address already in use"; then
        # 提取所有被占用的端口
        local ports=$(echo "$error_output" | grep -oP "listen \S+ :(\d+)" | grep -oP "\d+" || 
                    echo "$error_output" | grep -oP ":(\d+): bind" | grep -oP "\d+")
        
        # 使用一个数组记录已处理的端口，避免重复显示
        declare -A processed_ports
        
        for port in $ports; do
            # 跳过已处理的端口
            [[ -n "${processed_ports[$port]}" ]] && continue
            processed_ports[$port]=1
            
            # 检查是否被 gost 使用
            local pid_info=$(ss -tulnp | grep ":$port " | grep -oP "pid=\K\d+" | head -1)
            
            if is_process_gost "$pid_info" && is_gost_running; then
                echo -e "${COLOR_YELLOW}🔄 端口占用提示:${COLOR_RESET} 端口 $port 已被当前运行的 Gost 服务使用"
                echo "  ► 占用情况:"
                ss -tulnp | grep ":$port " | sed 's/^/    /'
                echo -e "  ► ${COLOR_GREEN}提示:${COLOR_RESET} 这是正常情况，Gost 正在使用配置的端口"
                echo
            else
                echo -e "${COLOR_RED}🚨 端口冲突:${COLOR_RESET} 端口 $port 已被其他程序占用"
                echo "  ► 占用情况:"
                ss -tulnp | grep ":$port " | sed 's/^/    /'
                echo -e "  ► ${COLOR_YELLOW}建议:${COLOR_RESET} 请关闭使用此端口的程序，或修改配置使用其他端口"
                echo
            fi
        done
    elif echo "$error_output" | grep -q "no such host"; then
        local host=$(echo "$error_output" | grep -oP "dial \S+ ([^:]+)" | awk '{print $3}')
        echo -e "${COLOR_RED}🚨 主机无法解析:${COLOR_RESET} $host"
        echo -e "  ► ${COLOR_YELLOW}建议:${COLOR_RESET} 检查目标服务器名称是否正确，或尝试使用IP地址"
    elif echo "$error_output" | grep -q "connection refused"; then
        echo -e "${COLOR_RED}🚨 连接被拒绝:${COLOR_RESET} 无法连接到目标服务器"
        echo -e "  ► ${COLOR_YELLOW}建议:${COLOR_RESET} 检查目标服务器是否开启，端口是否正确，以及防火墙设置"
    elif echo "$error_output" | grep -q "yaml"; then
        echo -e "${COLOR_RED}🚨 YAML格式错误:${COLOR_RESET} 配置文件语法有问题"
        echo -e "  ► ${COLOR_YELLOW}建议:${COLOR_RESET} 检查配置文件语法，特别注意缩进和冒号后的空格"
        echo -e "  ► 错误详情:"
        echo "$error_output" | grep -i "yaml" | sed 's/^/    /'
    else
        echo -e "${COLOR_RED}🚨 其他错误:${COLOR_RESET}"
        echo "$cleaned_output" | sed 's/^/    /'
    fi
}

# ========== 主功能 ========== #
# 列出服务 - 改进显示格式
list_services() {
    local services=$(get_service_names)
    if [[ -z "$services" ]]; then
        print_warning "当前没有配置任何转发规则"
        return 1
    fi
    
    print_title "当前转发规则："
    local i=1
    
    while IFS=: read -r line_num name; do
        # 获取该服务的详细信息
        local config_info=$(get_service_config "$name")
        local protocol=$(echo "$config_info" | grep "^protocol=" | cut -d= -f2-)
        local listen_addr=$(echo "$config_info" | grep "^listen_addr=" | cut -d= -f2-)
        local listen_port=$(echo "$config_info" | grep "^listen_port=" | cut -d= -f2-)
        local target_addr=$(echo "$config_info" | grep "^target_addr=" | cut -d= -f2-)
        
        # 构建监听地址显示
        local listen_display
        if [[ -z "$listen_addr" ]]; then
            listen_display=":$listen_port"
        else
            listen_display="$listen_addr:$listen_port"
        fi
        
        printf "%3d) %s（类型：%s，%s ----> %s）\n" $i "$name" "$protocol" "$listen_display" "$target_addr"
        ((i++))
    done <<< "$services"
    
    return 0
}

add_service() {
    echo
    
    # 获取并验证服务名
    while true; do
        read -p "$(echo -e ${COLOR_CYAN}请输入服务名称:${COLOR_RESET}) " name
        if [[ -z "$name" ]]; then
            print_error "服务名不能为空，请重新输入"
            continue
        fi
        
        if service_exists "$name"; then
            print_error "服务名 '$name' 已存在，请使用其他名称"
            continue
        fi
        break
    done

    # 获取监听地址
    echo -n -e "${COLOR_CYAN}请输入监听地址 [默认本机]: ${COLOR_RESET}"
    read listen_addr
    
    # 获取并验证端口
    while true; do
        echo -n -e "${COLOR_CYAN}请输入监听端口 [默认自动分配]: ${COLOR_RESET}"
        read listen_port
        
        if [[ -z "$listen_port" ]]; then
            listen_port=$(get_random_port)
            [[ -z "$listen_port" ]] && print_error "无可用端口" && return
            print_success "自动分配端口: $listen_port"
            break
        elif [[ "$listen_port" =~ ^[0-9]+$ ]] && ((listen_port >= 1 && listen_port <= 65535)); then
            # 检查端口是否被占用（针对本地监听）
            if ! is_port_available_on_addr "$listen_addr" "$listen_port"; then
                print_warning "请选择其他端口或使用自动分配"
                continue
            fi
            break
        else
            print_error "端口无效，请输入1-65535之间的数字"
        fi
    done

    # 添加协议类型校验
    while true; do
        echo -n -e "${COLOR_CYAN}协议类型 [tcp/udp，默认tcp]: ${COLOR_RESET}"
        read protocol
        protocol="${protocol:-tcp}"
        if [[ "$protocol" == "tcp" || "$protocol" == "udp" ]]; then
            break
        else
            print_error "无效的协议类型，请输入 tcp 或 udp"
        fi
    done

    # 目标地址输入 - 支持完整格式
    while true; do
        echo -n -e "${COLOR_CYAN}请输入目标地址（IP:PORT）: ${COLOR_RESET}"
        read target_addr
        if [[ "$target_addr" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}:[0-9]{1,5}$ ]] || 
           [[ "$target_addr" =~ ^([a-fA-F0-9:]+):[0-9]{1,5}$ ]]; then
            break
        else
            print_error "目标地址格式错误，请使用 IP:端口 格式"
            print_error "示例: 192.168.1.100:443 或 [2001:db8::1]:80"
        fi
    done

    # 根据是否提供监听地址，构建不同的地址格式
    local addr_line
    if [[ -z "$listen_addr" ]]; then
        addr_line="  addr: :$listen_port"
    else
        addr_line="  addr: $listen_addr:$listen_port"
    fi

    # 构建YAML配置块
    yaml_block="- name: $name
$addr_line
  handler:
    type: $protocol
  listener:
    type: $protocol
  forwarder:
    nodes:
    - name: $name
      addr: $target_addr"

    echo
    echo -e "${COLOR_YELLOW}◆ 预览新配置:${COLOR_RESET}"
    echo "$yaml_block"
    echo
    read -p "确认添加此规则？[Y/n]: " confirm
    [[ "$confirm" =~ ^[Nn]$ ]] && print_warning "取消操作" && return

    # 修复空数组问题
    # 检查配置文件中是否有 "services: []"
    if grep -q "services: \[\]" "$CONFIG_FILE"; then
        # 替换为正确的格式
        sed -i 's/services: \[\]/services:/' "$CONFIG_FILE"
    fi

    # 确保配置文件存在
    if ! grep -q "^services:" "$CONFIG_FILE"; then
        # 如果没有services行，创建一个新的配置文件
        echo "services:" > "$CONFIG_FILE.new"
        mv "$CONFIG_FILE.new" "$CONFIG_FILE"
    fi
    
    # 添加新规则到配置文件
    # 先检查services:后是否有内容
    if ! grep -q "^- name:" "$CONFIG_FILE"; then
        # services:后没有内容，直接添加
        echo "$yaml_block" >> "$CONFIG_FILE"
    else
        # 检查最后一行，确保正确添加
        last_line=$(tail -1 "$CONFIG_FILE")
        if ! echo "$last_line" | grep -q "^services:" && ! echo "$last_line" | grep -q "^- name:"; then
            echo >> "$CONFIG_FILE"  # 添加空行
        fi
        echo "$yaml_block" >> "$CONFIG_FILE"
    fi
    
    print_success "规则已写入配置文件"

    # 检查服务状态并重启
    echo -n "正在重启服务... "
    restart_output=$(systemctl daemon-reload && systemctl restart gost 2>&1)
    
    if [[ $? -eq 0 ]]; then
        print_success "服务已成功重启"
        print_success "配置规则添加成功"
    else
        print_error "服务重启失败"
        echo -e "${COLOR_RED}可能存在配置错误或端口冲突${COLOR_RESET}"
        echo "$restart_output"
        echo
        print_warning "配置已保存，但服务未正常启动，请检查错误后重试"
    fi
}

# 修改服务 - 修复版本
modify_service() {
    echo
    
    if ! list_services; then
        read -n 1 -s -r -p "按任意键返回菜单..."
        return
    fi
    
    echo
    echo -n -e "${COLOR_CYAN}请输入要修改的规则序号: ${COLOR_RESET}"
    read index
    
    # 获取选择的服务名称
    local selected=$(get_service_names | sed -n "${index}p")
    if [[ -z "$selected" ]]; then
        print_error "无效序号"
        read -n 1 -s -r -p "按任意键返回菜单..."
        return
    fi
    
    # 提取服务名称和行号
    local line_num=$(echo "$selected" | cut -d: -f1)
    local service_name=$(echo "$selected" | cut -d: -f2-)
    
    # 获取当前配置详情
    local config_info=$(get_service_config "$service_name")
    if [[ $? -ne 0 ]]; then
        print_error "无法读取服务配置信息"
        read -n 1 -s -r -p "按任意键返回菜单..."
        return
    fi
    
    # 读取现有配置
    local current_name=$(echo "$config_info" | grep "^name=" | cut -d= -f2-)
    local current_listen_addr=$(echo "$config_info" | grep "^listen_addr=" | cut -d= -f2-)
    local current_listen_port=$(echo "$config_info" | grep "^listen_port=" | cut -d= -f2-)
    local current_protocol=$(echo "$config_info" | grep "^protocol=" | cut -d= -f2-)
    local current_target_addr=$(echo "$config_info" | grep "^target_addr=" | cut -d= -f2-)
    
    # 显示当前配置
    echo
    print_title "当前配置:"
    echo "服务名: $current_name"
    echo "监听地址: ${current_listen_addr:-本机}"
    echo "监听端口: $current_listen_port"
    echo "协议类型: $current_protocol"
    echo "目标地址: $current_target_addr"
    echo
    
    # 确认是否修改，默认为 Y
    read -p "确认修改此规则？[Y/n]: " confirm
    if [[ "$confirm" =~ ^[Nn]$ ]]; then
        print_warning "取消修改"
        return
    fi
    
    # 修改服务名称 - 允许修改，但需验证不为空和不重复
    local name
    while true; do
        echo -n -e "${COLOR_CYAN}请输入新的服务名 [当前: $current_name，留空保持不变]: ${COLOR_RESET}"
        read name
        
        # 如果留空，保持当前名称
        if [[ -z "$name" ]]; then
            name="$current_name"
            break
        fi
        
        # 检查是否与其他服务重名(排除自身)
        if grep -v "^- name: $current_name$" "$CONFIG_FILE" | grep -q "^- name: $name$"; then
            print_error "服务名 '$name' 已存在，请使用其他名称"
            continue
        fi
        
        # 通过验证
        break
    done
    
    # 修改监听地址
    echo -n -e "${COLOR_CYAN}请输入新的监听地址 [当前: ${current_listen_addr:-本机}，留空保持不变]: ${COLOR_RESET}"
    read listen_addr
    listen_addr="${listen_addr:-$current_listen_addr}"
    
    # 修改监听端口
    while true; do
        echo -n -e "${COLOR_CYAN}请输入新的监听端口 [当前: $current_listen_port，留空保持不变]: ${COLOR_RESET}"
        read listen_port
        
        if [[ -z "$listen_port" ]]; then
            listen_port="$current_listen_port"
            break
        elif [[ "$listen_port" =~ ^[0-9]+$ ]] && ((listen_port >= 1 && listen_port <= 65535)); then
            # 如果端口不是当前端口，检查是否被占用
            if [[ "$listen_port" != "$current_listen_port" ]]; then
                if ! is_port_available_on_addr "$listen_addr" "$listen_port"; then
                    print_warning "请选择其他端口或保留当前端口"
                    continue
                fi
            fi
            break
        else
            print_error "端口无效，请输入1-65535之间的数字"
        fi
    done
    
    # 修改协议类型
    while true; do
        echo -n -e "${COLOR_CYAN}请输入新的协议类型 [当前: $current_protocol，留空保持不变]: ${COLOR_RESET}"
        read protocol
        
        if [[ -z "$protocol" ]]; then
            protocol="$current_protocol"
            break
        elif [[ "$protocol" == "tcp" || "$protocol" == "udp" ]]; then
            break
        else
            print_error "无效的协议类型，请输入 tcp 或 udp"
        fi
    done
    
    # 修改目标地址
    while true; do
        echo -n -e "${COLOR_CYAN}请输入新的目标地址 [当前: $current_target_addr，留空保持不变]: ${COLOR_RESET}"
        read target_addr
        
        if [[ -z "$target_addr" ]]; then
            target_addr="$current_target_addr"
            break
        elif [[ "$target_addr" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}:[0-9]{1,5}$ ]] || 
             [[ "$target_addr" =~ ^([a-fA-F0-9:]+):[0-9]{1,5}$ ]]; then
            break
        else
            print_error "目标地址格式错误，请使用 IP:端口 格式"
            print_error "示例: 192.168.1.100:443 或 [2001:db8::1]:80"
        fi
    done
    
    # 根据是否提供监听地址，构建不同的地址格式
    local addr_line
    if [[ -z "$listen_addr" ]]; then
        addr_line="  addr: :$listen_port"
    else
        addr_line="  addr: $listen_addr:$listen_port"
    fi
    
    # 构建YAML配置块
    yaml_block="- name: $name
$addr_line
  handler:
    type: $protocol
  listener:
    type: $protocol
  forwarder:
    nodes:
    - name: $name
      addr: $target_addr"
    
    echo
    echo -e "${COLOR_YELLOW}◆ 修改后配置:${COLOR_RESET}"
    echo "$yaml_block"
    echo
    read -p "确认更新此规则？[Y/n]: " confirm
    [[ "$confirm" =~ ^[Nn]$ ]] && print_warning "取消操作" && return
    
    # 删除旧规则
    # 查找下一个服务的行号或文件结尾
    next_line=$(awk -v start="$((line_num+1))" 'NR>=start && /^- name:/ {print NR; exit}' "$CONFIG_FILE")
    if [[ -z "$next_line" ]]; then
        # 如果是最后一个服务，找下一个主要部分或文件结尾
        next_line=$(awk -v start="$((line_num+1))" 'NR>=start && /^[^ -]/ {print NR-1; exit}' "$CONFIG_FILE")
        if [[ -z "$next_line" ]]; then
            next_line=$(wc -l < "$CONFIG_FILE")
        fi
    else
        # 减1因为我们要删到上一个服务的末尾
        next_line=$((next_line - 1))
    fi
    
    # 替换配置部分
    tmpfile=$(mktemp)
    sed "${line_num},${next_line}d" "$CONFIG_FILE" > "$tmpfile"
    
    # 将新配置添加到合适位置
    if [[ $line_num -eq 2 ]]; then
        # 如果是第一个规则（在services:行之后）
        awk -v block="$yaml_block" -v pos="$line_num" '
            NR==1 {print; print block; next}
            NR>=pos {print}
        ' "$tmpfile" > "$tmpfile.new"
    else
        # 否则在上一个规则后面插入
        awk -v block="$yaml_block" -v pos="$line_num" '
            NR<pos-1 {print}
            NR==pos-1 {print; print block}
            NR>=pos {print}
        ' "$tmpfile" > "$tmpfile.new"
    fi
    
    mv "$tmpfile.new" "$CONFIG_FILE"
    rm -f "$tmpfile"
    
    print_success "规则已更新"
    
    # 重启服务并增加错误处理
    echo -n "正在重启服务... "
    restart_output=$(systemctl daemon-reload && systemctl restart gost 2>&1)
    
    if [[ $? -eq 0 ]]; then
        print_success "服务已成功重启"
        print_success "配置规则修改成功"
    else
        print_error "服务重启失败"
        echo -e "${COLOR_RED}可能存在配置错误或端口冲突${COLOR_RESET}"
        parse_gost_error "$restart_output"
        echo
        print_warning "配置已保存，但服务未正常启动，请检查错误后重试"
    fi
    
    read -n 1 -s -r -p "按任意键返回菜单..."
}

delete_service() {
    echo
    if ! list_services; then
        read -n 1 -s -r -p "按任意键返回菜单..."
        return
    fi
    
    echo
    echo -n -e "${COLOR_CYAN}请输入要删除的规则序号: ${COLOR_RESET}"
    read index
    
    # 获取选择的服务行号
    selected=$(get_service_names | sed -n "${index}p")
    if [[ -z "$selected" ]]; then
        print_error "无效序号"
        read -n 1 -s -r -p "按任意键返回菜单..."
        return
    fi
    
    # 提取行号和服务名
    IFS=: read line_num service_name <<< "$selected"
    
    # 确认删除
    echo -e "${COLOR_YELLOW}将删除服务: ${COLOR_RESET}${service_name}"
    read -p "确认删除？[y/N]: " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        print_warning "取消删除"
        read -n 1 -s -r -p "按任意键返回菜单..."
        return
    fi
    
    # 查找下一个服务的行号或文件结尾
    next_line=$(awk -v start="$((line_num+1))" 'NR>=start && /^- name:/ {print NR; exit}' "$CONFIG_FILE")
    if [[ -z "$next_line" ]]; then
        # 如果是最后一个服务，找下一个主要部分或文件结尾
        next_line=$(awk -v start="$((line_num+1))" 'NR>=start && /^[^ -]/ {print NR-1; exit}' "$CONFIG_FILE")
        if [[ -z "$next_line" ]]; then
            next_line=$(wc -l < "$CONFIG_FILE")
        fi
    else
        # 减1因为我们要删到上一个服务的末尾
        next_line=$((next_line - 1))
    fi
    
    # 删除服务
    sed -i "${line_num},${next_line}d" "$CONFIG_FILE"
    print_success "规则 ${service_name} 已删除"

    # 重启服务并处理错误
    echo -n "正在重启服务... "
    restart_output=$(systemctl daemon-reload && systemctl restart gost 2>&1)
    
    if [[ $? -eq 0 ]]; then
        print_success "服务已成功重启"
    else
        print_error "服务重启失败，但规则已删除"
        parse_gost_error "$restart_output"
    fi
    
    read -n 1 -s -r -p "按任意键返回菜单..."
}

# 验证配置文件 - 完全重写以修复端口占用检测问题
validate_config() {
    echo
    print_title "校验配置文件格式"
    
    # 检查 gost 服务状态
    local gost_running=0
    if is_gost_running; then
        print_success "Gost 服务正在运行"
        gost_running=1
    else
        print_warning "Gost 服务未运行"
        gost_running=0
    fi
    
    # 检查文件是否存在
    if [[ ! -f "$CONFIG_FILE" ]]; then
        print_error "配置文件不存在: $CONFIG_FILE"
        read -n 1 -s -r -p "按任意键返回菜单..."
        return 1
    fi
    
    # 检查基本格式
    if ! grep -q "^services:" "$CONFIG_FILE"; then
        print_error "配置文件格式错误: 缺少 'services:' 声明"
        echo
        read -p "是否格式化配置文件？此操作将清空所有配置！[y/N]: " confirm
        if [[ "$confirm" =~ ^[Yy]$ ]]; then
            # 备份原文件
            backup_file="${CONFIG_FILE}.bak.$(date +%s)"
            cp "$CONFIG_FILE" "$backup_file"
            print_success "原配置已备份到: $backup_file"
            
            # 创建新配置
            echo "services:" > "$CONFIG_FILE"
            print_success "配置文件已格式化"
            
            systemctl daemon-reload
            systemctl restart gost
        fi
        read -n 1 -s -r -p "按任意键返回菜单..."
        return 1
    fi
    
    # 检查 services: [] 格式
    if grep -q "services: \[\]" "$CONFIG_FILE"; then
        print_warning "配置文件使用了空数组格式: 'services: []'"
        echo
        read -p "是否修复此问题？[Y/n]: " confirm
        if [[ ! "$confirm" =~ ^[Nn]$ ]]; then
            # 备份原文件
            backup_file="${CONFIG_FILE}.bak.$(date +%s)"
            cp "$CONFIG_FILE" "$backup_file"
            print_success "原配置已备份到: $backup_file"
            
            # 修复格式
            sed -i 's/services: \[\]/services:/' "$CONFIG_FILE"
            print_success "配置文件已修复"
            
            systemctl daemon-reload
            systemctl restart gost
        fi
        read -n 1 -s -r -p "按任意键返回菜单..."
        return 1
    fi
    
    # 检查 Python3 是否安装
    if ! command -v python3 &>/dev/null; then
        print_warning "未检测到 Python3，无法进行高级 YAML 语法检查"
        install_python3
    fi
    
    # 基本YAML语法检查(如果Python可用)
    if command -v python3 &>/dev/null; then
        if ! python3 -c "import yaml" &>/dev/null; then
            print_warning "系统未安装 PyYAML 模块，无法进行 YAML 语法检查"
            install_pyyaml
        fi
        
        if python3 -c "import yaml" &>/dev/null; then
            echo -e "${COLOR_CYAN}进行 YAML 语法检查...${COLOR_RESET}"
            if ! python3 -c "import yaml; yaml.safe_load(open('$CONFIG_FILE'))" 2>/dev/null; then
                print_error "配置文件YAML语法错误"
                echo
                read -p "是否格式化配置文件？此操作将清空所有配置！[y/N]: " confirm
                if [[ "$confirm" =~ ^[Yy]$ ]]; then
                    # 备份原文件
                    backup_file="${CONFIG_FILE}.bak.$(date +%s)"
                    cp "$CONFIG_FILE" "$backup_file"
                    print_success "原配置已备份到: $backup_file"
                    
                    # 创建新配置
                    echo "services:" > "$CONFIG_FILE"
                    print_success "配置文件已格式化"
                    
                    systemctl daemon-reload
                    systemctl restart gost
                fi
                read -n 1 -s -r -p "按任意键返回菜单..."
                return 1
            fi
            print_success "YAML 语法检查通过"
        fi
    fi
    
    # 尝试通过 gost 验证配置
    echo -e "${COLOR_CYAN}使用 gost 验证配置文件结构...${COLOR_RESET}"
    
    # 使用 -D 选项仅验证不启动
    validation_result=$(gost -C "$CONFIG_FILE" -D 2>&1)
    validation_status=$?
    
    # 分析验证结果是否只有端口被gost自身占用的警告
    analysis_result="has_errors"
    if [[ $validation_status -ne 0 ]]; then
        analysis_result=$(analyze_validation_result "$validation_result")
    fi
    
    # 根据分析结果显示不同的信息
    if [[ $validation_status -eq 0 || "$analysis_result" == "only_warnings" ]]; then
        if [[ $validation_status -eq 0 ]]; then
            print_success "配置文件结构完全正确"
        else
            print_success "配置文件结构正确，仅有端口已被 Gost 使用的提示"
        fi
        
        # 主动检查所有配置的端口
        echo -e "\n${COLOR_YELLOW}◆ 详细信息:${COLOR_RESET}"
        
        # 提取配置中的端口和地址
        local port_info=$(grep -A1 "^- name:" "$CONFIG_FILE" | grep "addr:" | sed -E 's/.*addr: (.*)/\1/')
        
        if [[ -n "$port_info" ]]; then
            # 用于跟踪是否有端口被其他程序占用
            local other_process_using_port=0
            
            while read -r addr; do
                local port
                local listen_addr=""
                
                if [[ "$addr" == :* ]]; then
                    # 格式是 :端口
                    port="${addr:1}"
                else
                    # 格式是 地址:端口
                    listen_addr="${addr%:*}"
                    port="${addr##*:}"
                fi
                
                # 检查端口占用
                if is_local_address "$listen_addr"; then
                    if ss -tuln | grep -q ":$port "; then
                        local pid_info=$(ss -tulnp | grep ":$port " | grep -oP "pid=\K\d+" | head -1)
                        if [[ -n "$pid_info" ]]; then
                            local process_name=$(ps -p $pid_info -o comm= 2>/dev/null || echo "未知进程")
                            
                            # 检查是否是 gost 本身占用的端口
                            if is_process_gost "$pid_info" && [[ $gost_running -eq 1 ]]; then
                                echo -e "${COLOR_YELLOW}🔄 端口占用提示:${COLOR_RESET} 端口 $port 已被当前运行的 Gost 服务使用"
                                echo "  ► 占用情况:"
                                ss -tulnp | grep ":$port " | sed 's/^/    /'
                                echo -e "  ► ${COLOR_GREEN}提示:${COLOR_RESET} 这是正常情况，Gost 正在使用配置的端口"
                                echo
                            else
                                echo -e "${COLOR_RED}🚨 端口冲突:${COLOR_RESET} 端口 $port 已被其他程序 $process_name (PID: $pid_info) 占用"
                                echo "  ► 占用情况:"
                                ss -tulnp | grep ":$port " | sed 's/^/    /'
                                echo -e "  ► ${COLOR_YELLOW}建议:${COLOR_RESET} 请关闭使用此端口的程序，或修改配置使用其他端口"
                                echo
                                other_process_using_port=1
                            fi
                        fi
                    fi
                fi
            done <<< "$port_info"
        fi
        
        echo -e "${COLOR_YELLOW}◆ 端口占用情况检查:${COLOR_RESET}"
        
        if [[ -z "$port_info" ]]; then
            echo "未发现配置的端口"
        else
            echo -e "${COLOR_CYAN}以下端口已配置:${COLOR_RESET}"
            local has_issue=0
            
            while read -r addr; do
                local port
                local listen_addr=""
                
                if [[ "$addr" == :* ]]; then
                    # 格式是 :端口
                    port="${addr:1}"
                else
                    # 格式是 地址:端口
                    listen_addr="${addr%:*}"
                    port="${addr##*:}"
                fi
                
                echo -n "  $addr: "
                
                # 检查端口占用
                if is_local_address "$listen_addr"; then
                    if ss -tuln | grep -q ":$port "; then
                        local pid_info=$(ss -tulnp | grep ":$port " | grep -oP "pid=\K\d+" | head -1)
                        if [[ -n "$pid_info" ]]; then
                            local process_name=$(ps -p $pid_info -o comm= 2>/dev/null || echo "未知进程")
                            
                            # 检查是否是 gost 本身占用的端口
                            if is_process_gost "$pid_info" && [[ $gost_running -eq 1 ]]; then
                                echo -e "${COLOR_GREEN}由 Gost 自身使用 (正常)${COLOR_RESET}"
                            else
                                echo -e "${COLOR_YELLOW}被进程 $process_name (PID: $pid_info) 占用${COLOR_RESET}"
                                has_issue=1
                            fi
                        else
                            echo -e "${COLOR_YELLOW}已被占用${COLOR_RESET}"
                            has_issue=1
                        fi
                    else
                        echo -e "${COLOR_GREEN}可用${COLOR_RESET}"
                    fi
                else
                    echo -e "${COLOR_GREEN}非本地地址，跳过检查${COLOR_RESET}"
                fi
            done <<< "$port_info"
            
            if [[ $has_issue -eq 1 ]]; then
                echo
                print_warning "发现端口被其他程序占用，可能导致部分规则无法正常工作"
                print_warning "建议修改配置使用其他未占用端口，或关闭占用端口的程序"
            else
                print_success "所有配置的端口都可用或已被 Gost 自身使用"
            fi
        fi
    else
        print_error "配置验证失败"
        
        # 调用自定义函数解析错误
        parse_gost_error "$validation_result"
        
        # 提供操作选项
        echo
        echo -e "${COLOR_CYAN}可选操作:${COLOR_RESET}"
        echo "1) 尝试自动修复配置格式问题"
        echo "2) 格式化配置（清空所有规则）"
        echo "3) 返回主菜单"
        echo -n -e "${COLOR_YELLOW}请选择: ${COLOR_RESET}"
        read choice
        
        case "$choice" in
            1) 
                # 尝试自动修复
                backup_file="${CONFIG_FILE}.bak.$(date +%s)"
                cp "$CONFIG_FILE" "$backup_file"
                print_success "原配置已备份到: $backup_file"
                
                # 修复格式
                sed -i 's/services: \[\]/services:/' "$CONFIG_FILE"
                
                # 调整缩进
                tmpfile=$(mktemp)
                awk '
                /^services:/ {print; next}
                /^- name:/ {print; next}
                /^  / {print; next}
                /^[^ ]/ && !/^$/ {print "  "$0; next}
                {print}
                ' "$CONFIG_FILE" > "$tmpfile"
                mv "$tmpfile" "$CONFIG_FILE"
                
                print_success "尝试自动修复完成"
                systemctl daemon-reload
                systemctl restart gost
                ;;
            2)
                # 格式化配置
                backup_file="${CONFIG_FILE}.bak.$(date +%s)"
                cp "$CONFIG_FILE" "$backup_file"
                print_success "原配置已备份到: $backup_file"
                
                # 创建新配置
                echo "services:" > "$CONFIG_FILE"
                print_success "配置文件已格式化"
                
                systemctl daemon-reload
                systemctl restart gost
                ;;
            *) 
                print_warning "返回主菜单" 
                ;;
        esac
    fi
    
    read -n 1 -s -r -p "按任意键返回菜单..."
    return 0
}


# ========== 主菜单 ========== #
show_menu() {
    clear
    print_title "Gost 转发规则管理"
    echo "1) 新增转发规则"
    echo "2) 修改转发规则"
    echo "3) 删除转发规则"
    echo "4) 查看当前配置"
    echo "5) 校验配置文件"
    echo "0) 退出"
    echo
    echo -n -e "${COLOR_YELLOW}请选择操作: ${COLOR_RESET}"
    read choice
    case "$choice" in
        1) add_service ;;
        2) modify_service ;;
        3) delete_service ;;
        4) clear; cat "$CONFIG_FILE"; echo; read -n 1 -s -r -p "按任意键返回菜单..." ;;
        5) validate_config ;;
        0) exit ;;
        *) print_warning "无效输入"; sleep 1 ;;
    esac
}

# 修正可能已经损坏的配置文件
fix_config_file() {
    if [[ ! -f "$CONFIG_FILE" ]]; then
        return
    fi
    
    # 检查配置文件格式，修复services: []
    if grep -q "services: \[\]" "$CONFIG_FILE"; then
        print_warning "修复配置文件格式：services: [] -> services:"
        sed -i 's/services: \[\]/services:/' "$CONFIG_FILE"
    fi
    
    # 检查配置文件格式，如果已经损坏，尝试修复
    if ! grep -q "^services:" "$CONFIG_FILE"; then
        print_warning "配置文件格式可能有问题，尝试修复..."
        # 备份原文件
        cp "$CONFIG_FILE" "${CONFIG_FILE}.bak.$(date +%s)"
        
        # 创建新的正确格式文件
        echo "services:" > "$CONFIG_FILE.new"
        
        # 提取并修正现有规则
        grep -n "^ *- name:" "$CONFIG_FILE" | while IFS=: read -r line_num line_content; do
            # 如果是顶级name条目，保持正确缩进
            if [[ "$line_content" =~ ^-\ name: ]]; then
                # 读取完整规则块，保持正确缩进
                awk -v start="$line_num" 'NR>=start {
                    if(NR>start && $0 ~ /^- name:/) exit;
                    print $0
                }' "$CONFIG_FILE" >> "$CONFIG_FILE.new"
            fi
        done
        
        # 替换原文件
        mv "$CONFIG_FILE.new" "$CONFIG_FILE"
        print_success "配置文件已修复"
    fi
}

# 主程序入口
prepare_environment
fix_config_file
while true; do show_menu; done
