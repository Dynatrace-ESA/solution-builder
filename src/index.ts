import fs from 'fs';
import shell from 'shelljs';
import AdmZip from "adm-zip";
import chalk from 'chalk';
import { exit } from 'process';

// Let's extend that shelljs thing:
shell.mkpath = item => {
    const currentDir = shell.pwd();
    const dirs = item.split('/');

    for (let i = 0; i < dirs.length; i++) {
        if (i === dirs.length - 1 && dirs[i].includes('.'))
            break;  // The last entry may be a file name.

        if (!shell.test('-d', dirs[i]))
            shell.mkdir(dirs[i]);

        shell.cd(dirs[i]);
    }
    shell.cd(currentDir);
}

/*  Command line options:
    doc:      "Documentation"   - Just regenerate the documentation pages.
    dev:      "Dependencies"    - Also install dependencies to run in VSCode.
    app:      "Application"     - Compile everything needed into /build (no ZIP).
    solution: "Solution"        - Create a Dynatrace plugin as ZIP file in /dist.
*/
const cmdArgs = process.argv.slice(2);
const docOnly = cmdArgs.length === 1 && cmdArgs[0] === 'doc';
const devOnly = cmdArgs.length === 0 ||
                cmdArgs.length === 1 && cmdArgs[0] === 'dev';
                
const options: any = cmdArgs.reduce((args, arg) => { args[arg] = true; return args; }, {});

const startTime = new Date().getTime();
const reportResult = () => {
    console.info(chalk.blueBright('Build completed in ' + ((new Date().getTime() - startTime) / 1000).toFixed(2) + 's'));
}

// Convert a whitelist or a blacklist into a list of files 
// that actually exist in the current directory.
const resolveFileNames = item => {
    const silentState = shell.config.silent;
    shell.config.silent = true;

    let matcher = null;
    if (item.startsWith('**/')) {
        matcher = new RegExp("^"
            + item.substring(3)
                .replace(/\./g, '\\.')
                .replace(/\?/g, '.')
                .replace(/\*/g, '.+')
            + "$",
            'g'
        );
    }
    const result = item.endsWith('/')
        ? shell.ls('-d', item)
        : matcher
        ? shell.find('.')
            .filter(f => f.includes('.') && !f.includes('node_modules/'))
            .filter(f => {
                const i = f.lastIndexOf('/');
                return matcher.test(i === -1 ? f : f.substring(i + 1));
            })
        : shell.ls('-l', item).filter(f => f.size > 0).map(f => f.name);

    shell.config.silent = silentState;
    return result;
}

const installDevelopmentModules = dirName => {
    if (devOnly) {
        console.log(chalk.yellow("Installing node modules in " + dirName));

        shell.cd(dirName);
        console.log(chalk.gray(shell.exec('npm install --silent', { silent: true })));
        shell.cd('..');
    }
}

const installProductionModules = dirName => {
    console.log(chalk.yellow("Installing node modules in /build/" + dirName));

    shell.cd(buildDir + '/' + dirName);
    console.log(chalk.gray(shell.exec('npm install --production --silent', { silent: true })));
    shell.cd(sourceDir + '/' + dirName);
}

const sourceDir = __dirname;
const buildDir  = __dirname + '/build';
const distDir   = __dirname + '/dist';
const buildDirs = [];
const defaults = {
    blacklist: [],
    whitelist: []
};
// Read the .buildignore file and translate into blacklists and whitelists.
fs.readFileSync('.buildignore', { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(line => line.trim() !== "" && !line.startsWith("#"))
    .forEach(line => {
        const kvPair = line.split(":");
        const key    = kvPair[0] === "*" ? "*" : kvPair[0].trim().slice(0, -1);
        const values = kvPair[1] ? kvPair[1].split(",").map(name => name.trim()) : [];
        const black  = values.filter(v =>  v.startsWith("!")).map(v => v.substring(1));
        const white  = values.filter(v => !v.startsWith("!")).map(v => v === "*" ? "." : v);

        // console.log("Blacklist for '" + key + "': " + black.join(", "));
        // console.log("Whitelist for '" + key + "': " + white.join(", "));

        if (key === "*") {
            defaults.blacklist = black;
            defaults.whitelist = white;
        }
        else {
            buildDirs.push({
                name: key,
                blacklist: black.length > 0 ? black : undefined,
                whitelist: white.length > 0 ? white : undefined
            })
        }
    });

const solInfo = JSON.parse(fs.readFileSync("plugin.json", {encoding: 'utf8'}));
const solName = solInfo.name;
const appInfo = JSON.parse(fs.readFileSync("./server/package.json", {encoding: 'utf8'}));
const appName = appInfo.name;

shell.cd(sourceDir);

console.info(chalk.blueBright("Generating documentation files"));
shell.exec('node node_modules/jsdoc/jsdoc.js ./server -t ./doc/templates -d ./doc/apis');

if (docOnly) {
    reportResult();
    exit();
}

if (devOnly) {
    console.info(chalk.green("Running development build"));
}

// Install node modules wherever there is a package.json.
buildDirs.forEach(dir => {
    const dirName = dir.name;

    if (!shell.test('-f', dirName + '/package.json')) return;

    installDevelopmentModules(dirName);
});

if (devOnly) {
    reportResult();
    exit();
}

// Wipe /build directory clean.
console.info(chalk.blueBright("Running production build"));
shell.rm('-rf', buildDir);
shell.mkdir(buildDir);

// Ensure /dist exists and is empty.
if (shell.test('-d', distDir)) {
    shell.rm(distDir + "/.*");
}
else {
    shell.mkdir(distDir);
}

// Install production modules and copy select directories to /build. 
buildDirs.forEach(dir => {
    const dirName = dir.name;
    let targetDir = buildDir;

    if (dirName !== '') {
        if (!shell.test('-e', dirName)) return; // May not exist in this project.

        targetDir = buildDir + '/' + dirName;
        shell.mkdir(targetDir);
        shell.cd(dirName);
    }

    // If there's a tsconfig file, run a Typescript build.
    if (shell.test('-f', 'tsconfig.json')) {
        console.log(chalk.yellow("Compiling .ts files in '" + dirName + "'"));

        // This uses files in '<dir>' to generate files in 'build/<dir>'.
        // NOTE: It is important that the tsconfig really points to /build.
        console.log(chalk.gray(shell.exec('npm run build:prod', { silent: true })));

        // In Angular we don't have to install node modules.
        // Otherwise we will, but not for the root (that's dev-only stuff).
        if (dirName !== '' && !shell.test('-f', 'angular.json')) {
            shell.cp('package.json', targetDir + '/');
            installProductionModules(dirName);
        }
    }
    else {
        // If there is a package.json, build production node modules.
        // Don't do this for the root though (that's dev-only stuff).
        if (dirName !== '' && shell.test('-f', 'package.json')) {
            shell.cp('package.json', targetDir + '/');
            installProductionModules(dirName);
        }
    }

    // Copy files from '<dir>' to 'build/<dir>' using the blacklist
    // and the whitelist for this directory. That means: replace any 
    // wildcarded directories ('*/') and files ('.') with the actual,
    // matching directories and files as they exists in this directory.   
    console.log(chalk.yellow("Copying relevant files in '" + dirName + "' to /build/" + dirName));

    const whitelist = dir.whitelist
                    ? dir.whitelist.map(resolveFileNames).flat()
                    : defaults.whitelist.map(resolveFileNames).flat();
    const blacklist = dir.blacklist
                    ? dir.blacklist.map(resolveFileNames).flat()
                    : defaults.blacklist.map(resolveFileNames).flat();

    whitelist
        .filter(item => !blacklist.includes(item) &&
            !blacklist.includes(item.split('/')[0] + '/'))
        .forEach(item => {
            if (item.endsWith('/')) {
                shell.cp('-r', item, targetDir + '/')
            }
            else if (item.includes('/')) {
                shell.cd(targetDir);
                shell.mkpath(item);
                shell.cd(sourceDir + '/' + dirName);
                shell.cp(item, targetDir + '/' + item);
            }
            else {
                shell.cp(item, targetDir + '/');
            }
        });
        
    shell.cd(sourceDir);
});

// Finally, we're ready to create distribution packages.

if (options.app) {
    console.info(chalk.blueBright("Creating the application package"));

    let zip = new AdmZip();
    zip.addLocalFolder(buildDir);
    zip.writeZip(distDir + '/' + appName + '.zip');

    console.info(chalk.blueBright("Application package saved in /dist/" + appName + ".zip"));
}

if (options.solution) {
    const pluginFiles = ["plugin.json", "plugin.py"];

    console.info(chalk.blueBright("Building core plugin files"));

    const pathToSDK = shell.which("plugin_sdk");
    if (!pathToSDK) {
        console.error(chalk.red("Dynatrace plugin SDK was not found. Terminating build."));
        exit();
    }

    shell.mkdir(buildDir + '/pylib');

    // Copy required plugin files into /build/pylib and run the plugin SDK's 
    // build command there. 
    shell.cp(pluginFiles.map(name => sourceDir + '/' + name), buildDir + '/pylib/');
    shell.cd(buildDir + '/pylib');
    console.log(chalk.gray(shell.exec('plugin_sdk build_plugin --no_upload -d ./', { silent: true })));

    shell.mv(solName + '/*', '.');

    // Delete the ZIP file the plugin SDK created (we'll create our own).
    shell.rm(solName + '.zip');
    shell.rm(pluginFiles);
    shell.cd(sourceDir);

    console.info(chalk.blueBright("Creating the solution package"));

    let zip = new AdmZip();
    zip.addLocalFolder(buildDir, solName);
    zip.writeZip(distDir + '/' + solName + '.zip');

    console.info(chalk.blueBright("Solution package saved in /dist/" + solName + ".zip"));
}

reportResult();
