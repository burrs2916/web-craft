import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import commonZh from '../locales/zh-CN/common.json';
import terminalZh from '../locales/zh-CN/terminal.json';
import agentZh from '../locales/zh-CN/agent.json';
import commandZh from '../locales/zh-CN/command.json';
import remoteDesktopZh from '../locales/zh-CN/remoteDesktop.json';
import fileTransferZh from '../locales/zh-CN/fileTransfer.json';
import backendZh from '../locales/zh-CN/backend.json';
import cmsZh from '../locales/zh-CN/cms.json';
import opsZh from '../locales/zh-CN/ops.json';
import automationZh from '../locales/zh-CN/automation.json';

import commonEn from '../locales/en-US/common.json';
import terminalEn from '../locales/en-US/terminal.json';
import agentEn from '../locales/en-US/agent.json';
import commandEn from '../locales/en-US/command.json';
import remoteDesktopEn from '../locales/en-US/remoteDesktop.json';
import fileTransferEn from '../locales/en-US/fileTransfer.json';
import backendEn from '../locales/en-US/backend.json';
import cmsEn from '../locales/en-US/cms.json';
import opsEn from '../locales/en-US/ops.json';
import automationEn from '../locales/en-US/automation.json';

const resources = {
  'zh-CN': {
    common: commonZh,
    terminal: terminalZh,
    agent: agentZh,
    command: commandZh,
    remoteDesktop: remoteDesktopZh,
    fileTransfer: fileTransferZh,
    backend: backendZh,
    cms: cmsZh,
    ops: opsZh,
    automation: automationZh,
  },
  'en-US': {
    common: commonEn,
    terminal: terminalEn,
    agent: agentEn,
    command: commandEn,
    remoteDesktop: remoteDesktopEn,
    fileTransfer: fileTransferEn,
    backend: backendEn,
    cms: cmsEn,
    ops: opsEn,
    automation: automationEn,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'zh-CN',
    defaultNS: 'common',
    ns: ['common', 'terminal', 'agent', 'command', 'remoteDesktop', 'fileTransfer', 'backend', 'cms', 'ops', 'automation'],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'webcraft-locale',
    },
  });

export default i18n;
