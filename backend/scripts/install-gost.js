const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const GOST_VERSION = '3.0.0-nightly.20250218';
const BIN_DIR = path.join(__dirname, '../bin');
const ASSETS_DIR = path.join(__dirname, '../assets/gost');

// 获取系统信息
const platform = os.platform();
const arch = os.arch();

// 映射系统信息到文件名
const getFileName = () => {
    const platformMap = {
        'win32': 'windows',
        'linux': 'linux',
        'darwin': 'darwin'  // MacOS
    };

    const archMap = {
        'x64': 'amd64',
        'ia32': '386',
        'arm': 'arm',
        'arm64': 'arm64'
    };

    const platformName = platformMap[platform] || 'linux';
    const archName = archMap[arch] || 'amd64';

    if (platform === 'win32') {
        return `gost_${GOST_VERSION}_${platformName}_${archName}.zip`;
    }
    return `gost_${GOST_VERSION}_${platformName}_${archName}.tar.gz`;
};

// 检查文件是否存在
const checkFileExists = (filePath) => {
    if (!fs.existsSync(filePath)) {
        throw new Error(`文件不存在: ${filePath}`);
    }
    return filePath;
};

// 解压文件
const extractFile = async (filePath) => {
    const extractDir = path.join(BIN_DIR, 'temp');
    if (!fs.existsSync(extractDir)) {
        fs.mkdirSync(extractDir, { recursive: true });
    }

    if (platform === 'win32') {
        // Windows 使用 PowerShell 解压
        execSync(`powershell -command "Expand-Archive -Path '${filePath}' -DestinationPath '${extractDir}' -Force"`);
    } else {
        // Linux/Mac 使用 tar 解压
        try {
            // 确保解压目录存在
            execSync(`mkdir -p ${extractDir}`);
            
            // 检查tar命令是否可用
            execSync('which tar || echo "tar not found"');
            
            // 执行解压
            console.log(`解压文件: ${filePath} 到 ${extractDir}`);
            execSync(`tar -xzf "${filePath}" -C "${extractDir}"`);
        } catch (error) {
            console.error('解压失败:', error.message);
            throw error;
        }
    }

    // 移动可执行文件到 bin 目录
    const executableName = platform === 'win32' ? 'gost.exe' : 'gost';
    const sourcePath = path.join(extractDir, executableName);
    const targetPath = path.join(BIN_DIR, executableName);

    console.log(`移动文件: ${sourcePath} -> ${targetPath}`);

    try {
        fs.copyFileSync(sourcePath, targetPath);
        // 设置执行权限
        if (platform !== 'win32') {
            try {
                // 使用fs模块设置权限
                fs.chmodSync(targetPath, '755');
            } catch (chmodError) {
                // 备用方案：使用chmod命令
                try {
                    execSync(`chmod +x "${targetPath}"`);
                } catch (cmdError) {
                    console.error('设置执行权限失败:', cmdError.message);
                }
            }
        }
    } catch (error) {
        console.error('移动文件失败:', error.message);
        throw error;
    }

    // 清理临时文件
    try {
        fs.rmSync(extractDir, { recursive: true, force: true });
    } catch (error) {
        // 如果fs.rmSync不支持或失败，尝试使用rm命令
        if (platform !== 'win32') {
            try {
                execSync(`rm -rf "${extractDir}"`);
            } catch (rmError) {
                console.error('清理临时文件失败:', rmError.message);
            }
        }
    }
};

// 主函数
async function installGost() {
    try {
        // 创建 bin 目录
        if (!fs.existsSync(BIN_DIR)) {
            try {
                fs.mkdirSync(BIN_DIR, { recursive: true });
            } catch (error) {
                // 如果fs.mkdirSync失败，尝试使用mkdir命令
                if (platform !== 'win32') {
                    execSync(`mkdir -p "${BIN_DIR}"`);
                } else {
                    throw error;
                }
            }
        }

        const fileName = getFileName();
        const sourcePath = path.join(ASSETS_DIR, fileName);
        
        // 检查源文件是否存在
        try {
            const finalPath = checkFileExists(sourcePath);
            
            console.log('Installing Go-Gost...');
            console.log(`系统: ${platform}, 架构: ${arch}`);
            console.log(`使用文件: ${fileName}`);
            
            await extractFile(finalPath);

            // 验证安装
            const execPath = path.join(BIN_DIR, platform === 'win32' ? 'gost.exe' : 'gost');
            if (fs.existsSync(execPath)) {
                console.log('Go-Gost installation completed successfully!');
                
                // 确保在Linux上设置了执行权限
                if (platform !== 'win32') {
                    try {
                        execSync(`chmod +x "${execPath}"`);
                    } catch (error) {
                        console.error('Warning: Failed to set executable permissions');
                    }
                }
            } else {
                throw new Error('安装后可执行文件未找到');
            }
        } catch (error) {
            console.error(`文件 ${sourcePath} 不存在，请确保已下载正确版本的Go-Gost`);
            throw error;
        }
    } catch (error) {
        console.error('Failed to install Go-Gost:', error);
        process.exit(1);
    }
}

installGost(); 