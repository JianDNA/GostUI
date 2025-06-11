const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  platformUtils,
  isWindows,
  getGostExecutableName,
  getGostPlatformDir
} = require('../utils/platform');

const GOST_VERSION = '3.0.0-nightly.20250218';
const BIN_DIR = path.join(__dirname, '../bin');
const ASSETS_DIR = path.join(__dirname, '../assets/gost');

// 🔧 使用统一的平台检测获取文件名
const getFileName = () => {
    const platformDir = getGostPlatformDir(); // 例如: linux_amd64, windows_386

    if (isWindows()) {
        return `gost_${GOST_VERSION}_${platformDir}.zip`;
    }
    return `gost_${GOST_VERSION}_${platformDir}.tar.gz`;
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

    if (isWindows()) {
        // Windows 使用 PowerShell 解压
        execSync(`powershell -command "Expand-Archive -Path '${filePath}' -DestinationPath '${extractDir}' -Force"`);
    } else {
        // Linux/Mac 使用 tar 解压
        try {
            // 确保解压目录存在
            const mkdirCmd = platformUtils.getMkdirCommand(extractDir);
            execSync(mkdirCmd);

            // 检查tar命令是否可用
            if (!platformUtils.commandExists('tar')) {
                throw new Error('tar 命令不可用');
            }

            // 执行解压
            console.log(`解压文件: ${filePath} 到 ${extractDir}`);
            const extractCmd = platformUtils.getExtractCommand(filePath, extractDir);
            execSync(extractCmd);
        } catch (error) {
            console.error('解压失败:', error.message);
            throw error;
        }
    }

    // 移动可执行文件到 bin 目录
    const executableName = getGostExecutableName();
    const sourcePath = path.join(extractDir, executableName);
    const targetPath = path.join(BIN_DIR, executableName);

    console.log(`移动文件: ${sourcePath} -> ${targetPath}`);

    try {
        fs.copyFileSync(sourcePath, targetPath);
        // 设置执行权限
        if (!isWindows()) {
            try {
                // 使用fs模块设置权限
                fs.chmodSync(targetPath, '755');
            } catch (chmodError) {
                // 备用方案：使用chmod命令
                const chmodCmd = platformUtils.getChmodCommand(targetPath, '755');
                if (chmodCmd) {
                    try {
                        execSync(chmodCmd);
                    } catch (cmdError) {
                        console.error('设置执行权限失败:', cmdError.message);
                    }
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
        if (!isWindows()) {
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
                const mkdirCmd = platformUtils.getMkdirCommand(BIN_DIR);
                try {
                    execSync(mkdirCmd);
                } catch (cmdError) {
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
            platformUtils.printEnvironmentInfo();
            console.log(`使用文件: ${fileName}`);

            await extractFile(finalPath);

            // 验证安装 - 使用统一的平台工具
            const execPath = path.join(BIN_DIR, getGostExecutableName());
            if (fs.existsSync(execPath)) {
                console.log('Go-Gost installation completed successfully!');

                // 确保在Linux上设置了执行权限
                if (!isWindows()) {
                    try {
                        fs.chmodSync(execPath, '755');
                        console.log('✅ 执行权限设置成功');
                    } catch (error) {
                        console.error('⚠️ 设置执行权限失败:', error.message);
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