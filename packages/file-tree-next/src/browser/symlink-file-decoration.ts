import { Optinal } from '@ali/common-di';
import { IDecorationsProvider, IDecorationData } from '@ali/ide-decoration';
import { Uri, Emitter, localize } from '@ali/ide-core-browser';
import { FileTreeService } from './file-tree.service';

export class SymlinkDecorationsProvider implements IDecorationsProvider {
  readonly label = 'symbollink';

  readonly onDidChangeEmitter: Emitter<Uri[]> = new Emitter();

  constructor(@Optinal() private readonly fileTreeService: FileTreeService) {}

  get onDidChange() {
    return this.onDidChangeEmitter.event;
  }

  provideDecorations(resource: Uri): IDecorationData | undefined {
    const node = this.fileTreeService.getNodeByUriString(resource.toString());
    if (node && node.filestat) {
      if (node.filestat.isSymbolicLink) {
        return {
          letter: '⤷',
          source: node.filestat.uri,
          color: 'gitDecoration.ignoredResourceForeground',
          tooltip: localize('file.tooltip.symbolicLink'),
          // 保证单文件的情况下也可以取到对应的decoration
          weight: -1,
          bubble: !node.filestat.isDirectory,
        } as IDecorationData;
      }
    }
    return undefined;
  }
}