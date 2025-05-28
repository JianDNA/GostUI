/**
 * 跨平台兼容性工具模块
 * 提供统一的平台检测和处理方法
 * 支持 Windows, Debian, CentOS, Ubuntu, RHEL 等系统
 */

const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

class PlatformUtils {
  constructor() {
    this.platform = process.platform;
    this.arch = process.arch;
    this.osInfo = this.detectOS();
  }

  /**
   * 检测操作系统详细信息
   */
  detectOS() {
    const platform = process.platform;
    const release = os.release();
    const type = os.type();
    
    let osInfo = {
      platform,
      arch: process.arch,
      type,
      release,
      isWindows: platform === 'win32',
      isLinux: platform === 'linux',
      isMacOS: platform === 'darwin',
      distro: 'unknown',
      packageManager: 'unknown'
    };

    if (osInfo.isLinux) {
      osInfo = { ...osInfo, ...this.detectLinuxDistro() };
    } else if (osInfo.isWindows) {
      osInfo.distro = 'windows';
      osInfo.packageManager = 'chocolatey';
    } else if (osInfo.isMacOS) {
      osInfo.distro = 'macos';
      osInfo.packageManager = 'brew';
    }

    return osInfo;
  }

  /**
   * 检测 Linux 发行版
   */
  detectLinuxDistro() {
    let distro = 'linux';
    let packageManager = 'unknown';

    try {
      // 检查 /etc/os-release
      if (this.fileExists('/etc/os-release')) {
        const osRelease = execSync('cat /etc/os-release', { encoding: 'utf8' });
        
        if (osRelease.includes('Ubuntu')) {
          distro = 'ubuntu';
          packageManager = 'apt';
        } else if (osRelease.includes('Debian')) {
          distro = 'debian';
          packageManager = 'apt';
        } else if (osRelease.includes('CentOS')) {
          distro = 'centos';
          packageManager = this.commandExists('dnf') ? 'dnf' : 'yum';
        } else if (osRelease.includes('Red Hat')) {
          distro = 'rhel';
          packageManager = this.commandExists('dnf') ? 'dnf' : 'yum';
        } else if (osRelease.includes('Fedora')) {
          distro = 'fedora';
          packageManager = 'dnf';
        } else if (osRelease.includes('SUSE')) {
          distro = 'suse';
          packageManager = 'zypper';
        } else if (osRelease.includes('Arch')) {
          distro = 'arch';
          packageManager = 'pacman';
        }
      }
      
      // 备用检测方法
      if (distro === 'linux') {
        if (this.fileExists('/etc/debian_version')) {
          distro = 'debian';
          packageManager = 'apt';
        } else if (this.fileExists('/etc/redhat-release')) {
          distro = 'centos';
          packageManager = this.commandExists('dnf') ? 'dnf' : 'yum';
        }
      }
    } catch (error) {
      console.warn('无法检测 Linux 发行版:', error.message);
    }

    return { distro, packageManager };
  }

  /**
   * 检查文件是否存在
   */
  fileExists(filePath) {
    try {
      execSync(`test -f "${filePath}"`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 检查命令是否存在
   */
  commandExists(command) {
    try {
      if (this.osInfo.isWindows) {
        execSync(`where ${command}`, { stdio: 'ignore' });
      } else {
        execSync(`which ${command}`, { stdio: 'ignore' });
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取 Gost 可执行文件名
   */
  getGostExecutableName() {
    return this.osInfo.isWindows ? 'gost.exe' : 'gost';
  }

  /**
   * 获取 Gost 可执行文件路径
   */
  getGostExecutablePath(baseDir = path.join(__dirname, '../bin')) {
    return path.join(baseDir, this.getGostExecutableName());
  }

  /**
   * 获取平台特定的进程终止命令
   */
  getKillProcessCommand(processName) {
    if (this.osInfo.isWindows) {
      return `taskkill /f /im ${processName}`;
    } else {
      return `pkill -f ${processName}`;
    }
  }

  /**
   * 获取端口检查命令
   */
  getPortCheckCommand(port) {
    if (this.osInfo.isWindows) {
      return `netstat -ano | findstr :${port}`;
    } else {
      // 优先使用 lsof，备用 netstat
      if (this.commandExists('lsof')) {
        return `lsof -i :${port}`;
      } else {
        return `netstat -tuln | grep :${port}`;
      }
    }
  }

  /**
   * 获取进程列表命令
   */
  getProcessListCommand(processName) {
    if (this.osInfo.isWindows) {
      return `tasklist /fi "imagename eq ${processName}" /fo csv /nh`;
    } else {
      return `ps -ef | grep ${processName} | grep -v grep`;
    }
  }

  /**
   * 获取包管理器安装命令
   */
  getPackageInstallCommand(packages) {
    const packageList = Array.isArray(packages) ? packages.join(' ') : packages;
    
    switch (this.osInfo.packageManager) {
      case 'apt':
        return `apt update && apt install -y ${packageList}`;
      case 'yum':
        return `yum install -y ${packageList}`;
      case 'dnf':
        return `dnf install -y ${packageList}`;
      case 'zypper':
        return `zypper install -y ${packageList}`;
      case 'pacman':
        return `pacman -S --noconfirm ${packageList}`;
      case 'brew':
        return `brew install ${packageList}`;
      case 'chocolatey':
        return `choco install -y ${packageList}`;
      default:
        throw new Error(`不支持的包管理器: ${this.osInfo.packageManager}`);
    }
  }

  /**
   * 获取服务管理命令
   */
  getServiceCommand(serviceName, action) {
    if (this.osInfo.isWindows) {
      switch (action) {
        case 'start':
          return `net start ${serviceName}`;
        case 'stop':
          return `net stop ${serviceName}`;
        case 'restart':
          return `net stop ${serviceName} && net start ${serviceName}`;
        case 'status':
          return `sc query ${serviceName}`;
        default:
          throw new Error(`不支持的服务操作: ${action}`);
      }
    } else {
      // Linux 系统使用 systemctl
      return `systemctl ${action} ${serviceName}`;
    }
  }

  /**
   * 获取防火墙命令
   */
  getFirewallCommand(port, action = 'allow') {
    if (this.osInfo.isWindows) {
      if (action === 'allow') {
        return `netsh advfirewall firewall add rule name="Gost Manager - Port ${port}" dir=in action=allow protocol=TCP localport=${port}`;
      } else {
        return `netsh advfirewall firewall delete rule name="Gost Manager - Port ${port}"`;
      }
    } else {
      // Linux 系统
      if (this.commandExists('ufw')) {
        return action === 'allow' ? `ufw allow ${port}/tcp` : `ufw delete allow ${port}/tcp`;
      } else if (this.commandExists('firewall-cmd')) {
        if (action === 'allow') {
          return `firewall-cmd --permanent --add-port=${port}/tcp && firewall-cmd --reload`;
        } else {
          return `firewall-cmd --permanent --remove-port=${port}/tcp && firewall-cmd --reload`;
        }
      } else {
        console.warn('未找到支持的防火墙管理工具');
        return null;
      }
    }
  }

  /**
   * 获取文件权限设置命令
   */
  getChmodCommand(filePath, permissions = '755') {
    if (this.osInfo.isWindows) {
      // Windows 不需要 chmod
      return null;
    } else {
      return `chmod ${permissions} "${filePath}"`;
    }
  }

  /**
   * 获取目录创建命令
   */
  getMkdirCommand(dirPath) {
    if (this.osInfo.isWindows) {
      return `mkdir "${dirPath}"`;
    } else {
      return `mkdir -p "${dirPath}"`;
    }
  }

  /**
   * 获取文件解压命令
   */
  getExtractCommand(archivePath, extractDir) {
    const ext = path.extname(archivePath).toLowerCase();
    
    if (this.osInfo.isWindows) {
      if (ext === '.zip') {
        return `powershell -command "Expand-Archive -Path '${archivePath}' -DestinationPath '${extractDir}' -Force"`;
      } else {
        throw new Error(`Windows 不支持的压缩格式: ${ext}`);
      }
    } else {
      if (ext === '.gz' || archivePath.endsWith('.tar.gz')) {
        return `tar -xzf "${archivePath}" -C "${extractDir}"`;
      } else if (ext === '.zip') {
        return `unzip -o "${archivePath}" -d "${extractDir}"`;
      } else {
        throw new Error(`Linux 不支持的压缩格式: ${ext}`);
      }
    }
  }

  /**
   * 获取环境信息摘要
   */
  getEnvironmentSummary() {
    return {
      platform: this.osInfo.platform,
      distro: this.osInfo.distro,
      arch: this.osInfo.arch,
      packageManager: this.osInfo.packageManager,
      nodeVersion: process.version,
      hostname: os.hostname(),
      totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024) + 'GB',
      cpuCount: os.cpus().length
    };
  }

  /**
   * 打印环境信息
   */
  printEnvironmentInfo() {
    const info = this.getEnvironmentSummary();
    console.log('🖥️  系统环境信息:');
    console.log(`   平台: ${info.platform} (${info.distro})`);
    console.log(`   架构: ${info.arch}`);
    console.log(`   包管理器: ${info.packageManager}`);
    console.log(`   Node.js: ${info.nodeVersion}`);
    console.log(`   主机名: ${info.hostname}`);
    console.log(`   内存: ${info.totalMemory}`);
    console.log(`   CPU 核心: ${info.cpuCount}`);
  }
}

// 创建单例实例
const platformUtils = new PlatformUtils();

module.exports = {
  PlatformUtils,
  platformUtils,
  
  // 便捷方法
  isWindows: () => platformUtils.osInfo.isWindows,
  isLinux: () => platformUtils.osInfo.isLinux,
  isMacOS: () => platformUtils.osInfo.isMacOS,
  getDistro: () => platformUtils.osInfo.distro,
  getPackageManager: () => platformUtils.osInfo.packageManager,
  getGostExecutableName: () => platformUtils.getGostExecutableName(),
  getGostExecutablePath: (baseDir) => platformUtils.getGostExecutablePath(baseDir),
  commandExists: (command) => platformUtils.commandExists(command),
  printEnvironmentInfo: () => platformUtils.printEnvironmentInfo()
};
