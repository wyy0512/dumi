import { LOCAL_DUMI_DIR } from '@/constants';
import type { IApi } from '@/types';
import path from 'path';
import { deepmerge, glob, winPath } from 'umi/plugin-utils';

/**
 * exclude pre-compiling modules in mfsu mode
 * and make sure there has no multiple instances problem (such as react)
 */
export function safeExcludeInMFSU(api: IApi, excludes: RegExp[]) {
  if (api.userConfig.mfsu !== false) {
    api.modifyDefaultConfig((memo) => {
      memo.mfsu ??= {};
      memo.mfsu.exclude = deepmerge(memo.mfsu.exclude || [], excludes);

      // to avoid multiple instance of react in mfsu mode
      memo.extraBabelIncludes ??= [];
      memo.extraBabelIncludes.push(...excludes);

      return memo;
    });
  }
}

/**
 * get files by glob pattern
 */
function getFilesByGlob(globExp: string, dir: string) {
  return glob
    .sync(globExp, { cwd: dir })
    .map((file) => winPath(path.join(dir, file)));
}

/**
 * plugin for derive default behaviors from umi
 */
export default (api: IApi) => {
  const dumiAbsDir = path.join(api.cwd, LOCAL_DUMI_DIR);
  const strategies = {
    // TODO: umi need read appJS from appData
    // ref: https://github.com/umijs/umi/blob/9551b4d7832bc30088af75ecea60a0572d8ad767/packages/preset-umi/src/features/tmpFiles/tmpFiles.ts#L375
    appJS: getFilesByGlob.bind(null, 'app.{js,jsx,ts,tsx}', dumiAbsDir),
    globalCSS: getFilesByGlob.bind(
      null,
      'global.{css,less,scss,sass}',
      dumiAbsDir,
    ),
    globalJS: getFilesByGlob.bind(null, 'global.{js,jsx,ts,tsx}', dumiAbsDir),
    overridesCSS: getFilesByGlob.bind(
      null,
      'overrides.{css,less,scss,sass}',
      dumiAbsDir,
    ),
  };

  api.describe({ key: 'dumi:derivative' });

  // skip mfsu for client api, to avoid circular resolve in mfsu mode
  safeExcludeInMFSU(api, [new RegExp('dumi/dist/client')]);

  // only normal mode is supported, because src is not fixed in dumi project, eager mode may scan wrong dir
  api.modifyDefaultConfig((memo) => {
    if (api.userConfig.mfsu !== false) {
      memo.mfsu.strategy = 'normal';
    }

    return memo;
  });

  // move all conventional files to .dumi dir
  api.modifyAppData((memo) => {
    Object.entries(strategies).forEach(([key, fn]) => {
      memo[key] = fn();
    });

    return memo;
  });

  api.onGenerateFiles(() => {
    Object.entries(strategies).forEach(([key, fn]) => {
      api.appData[key] = fn();
    });
  });

  // register .dumi/app as runtime plugin
  api.addRuntimePlugin(() => {
    return strategies.appJS().slice(0, 1);
  });
};
