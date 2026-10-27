import appIcon from '../../../assets/brand/clipkeep-mark-128.png';
import { Icon } from '../../Icons';

export function Brand({ preview }: { preview: boolean }) {
  return <header className="masthead">
    <div className="brand">
      <img className="brand-mark" src={appIcon} alt="" width={72} height={72} />
      <div><h1>拾片 <span>Clipkeep</span></h1><p>把好内容，留在本机。</p></div>
    </div>
    <div className="brand-meta"><span className="local-badge"><span className="status-dot" />{preview ? '界面预览' : '本地下载'}</span>
      <span className="local-note"><Icon name="shield" size={14} />媒体处理在本机完成</span></div>
  </header>;
}
