import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VersionService } from '../../Services/version.service';
import { APP_NAME } from '../../Utils/brand';

@Component({
  selector: 'app-build-version',
  standalone: true,
  imports: [CommonModule],
  template: `
    <footer class="gc-app-footer">
      <p class="gc-app-version" [title]="tooltip">
        {{ appName }} <span class="gc-app-version-number">{{ systemVersion }}</span>
      </p>
      <p class="gc-app-copyright">
        © {{ currentYear }}
        <a
          href="https://www.punkcodesolution.com.br/"
          target="_blank"
          rel="noopener noreferrer">
          Punk Code Solution
        </a>
      </p>
    </footer>
  `,
})
export class BuildVersionComponent implements OnInit {
  readonly appName = APP_NAME;
  systemVersion = '';
  tooltip = '';
  currentYear = new Date().getFullYear();

  constructor(private versionService: VersionService) {}

  ngOnInit(): void {
    this.systemVersion = this.versionService.getSystemVersionLabel();
    this.tooltip = this.versionService.getSystemVersionTooltip();
  }
}
