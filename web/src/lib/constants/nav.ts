export interface ISite {
  name: string;
  value: string;
  icon?: string;
}

export const siteList: ISite[] = [
  { name: '上海', value: 'shangHai' },
  { name: '北京', value: 'beiJing' },
  { name: '广州', value: 'guangZhou' },
  { name: '深圳', value: 'shenZhen' },
];

export const defaultSiteIndex = 0;

type IUrl = string;

export interface INavItem {
  name: string;
  link: Record<string, IUrl>;
  source: string;
}

export const navList: INavItem[] = [
  {
    name: 'RouterOS',
    link: {
      shangHai: 'http://10.0.0.1',
      beiJing: 'http://10.1.0.1'
    },
    source: 'routerOS.png'
  },
  {
    name: 'OpenWRT',
    link: {
      shangHai: 'http://10.0.0.2',
      beiJing: 'http://10.1.0.2'
    },
    source: 'openWRT.png'
  },
  {
    name: 'Esxi',
    link: {
      shangHai: 'http://10.0.0.3',
      beiJing: 'http://10.1.0.3',
      guangZhou: 'http://10.2.0.3',
    },
    source: 'esxi.png'
  },
  {
    name: 'K2P',
    link: {
      shangHai: 'http://10.0.0.4',
      beiJing: 'http://10.1.0.4',
      shenZhen: 'http://10.2.0.4',
    },
    source: 'phicomm.png'
  },
  {
    name: 'Home Assistant',
    link: {
      shangHai: 'http://10.0.0.5',
      beiJing: 'http://10.1.0.5'
    },
    source: 'homeAssistant.svg'
  },
  {
    name: '思源笔记',
    link: {
      shangHai: 'http://10.0.0.16:6806/',
      beiJing: 'http://10.1.0.16:6806/'
    },
    source: 'siyuanNote.png'
  },
  {
    name: '博客',
    link: {
      shangHai: 'http://10.0.0.6',
      beiJing: 'http://10.1.0.6'
    },
    source: 'blog.png'
  },
  {
    name: 'Synology',
    link: {
      shangHai: 'http://10.0.0.5:5000',
      beiJing: 'http://10.1.0.5:5000'
    },
    source: 'synology.png'
  },
  {
    name: '相册',
    link: {
      shangHai: 'http://10.0.0.5:5080',
      beiJing: 'http://10.1.0.5:5080'
    },
    source: 'album.png'
  },
  {
    name: '文件夹',
    link: {
      shangHai: 'http://10.0.0.5:7000',
      beiJing: 'http://10.1.0.5:7000'
    },
    source: 'file.png'
  },
  {
    name: 'Jellyfin',
    link: {
      shangHai: 'http://10.0.0.12',
      beiJing: 'http://10.1.0.12'
    },
    source: 'jellyfin.svg'
  },
  {
    name: 'Surveillance',
    link: {
      shangHai: 'http://10.0.0.5:9900',
      beiJing: 'http://10.1.0.5:9900'
    },
    source: 'surveillanceStation.png'
  },
  {
    name: 'Nas Tools',
    link: {
      shangHai: 'http://10.0.0.14',
      beiJing: 'http://10.1.0.14'
    },
    source: 'nasTools.png'
  },
  {
    name: '青龙',
    link: {
      shangHai: 'http://10.0.0.15:5700',
      beiJing: 'http://10.1.0.15:5700'
    },
    source: 'qinglong.png'
  },
  {
    name: 'qBittorrent',
    link: {
      shangHai: 'http://10.0.0.11:8085',
      beiJing: 'http://10.1.0.11:8085'
    },
    source: 'qBittorrent.png'
  },
  {
    name: 'Portainer',
    link: {
      shangHai: 'http://10.0.0.10:9443',
      beiJing: 'http://10.1.0.10:9443'
    },
    source: 'portainer.svg'
  },
  {
    name: 'Jackett',
    link: {
      shangHai: 'http://10.0.0.13',
      beiJing: 'http://10.1.0.13'
    },
    source: 'jackett.png'
  },
]