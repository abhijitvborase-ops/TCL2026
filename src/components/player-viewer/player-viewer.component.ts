import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'app-player-viewer',
  standalone: true,
  templateUrl: './player-viewer.component.html'
})
export class PlayerViewerComponent implements OnInit {

  @Input() players: any[] = [];
  @Input() startIndex: number = 0;
  @Input() closeViewer: any;

  // 🔥 NEW (Draft function from parent)
  @Input() onDraft: any;

  currentIndex = 0;

  ngOnInit() {
    this.currentIndex = this.startIndex;
  }

  next() {
    if (this.currentIndex < this.players.length - 1) {
      this.currentIndex++;
    }
  }

  prev() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
    }
  }

  currentPlayer() {
    return this.players[this.currentIndex];
  }

  // 🔥 CLOSE VIEWER
  close() {
    if (this.closeViewer) {
      this.closeViewer();
    }
  }

  // 🔥 DRAFT PLAYER
  draftPlayer() {
    if (this.onDraft) {
      this.onDraft(this.currentPlayer());
    }

    // popup बंद कर
    if (this.closeViewer) {
      this.closeViewer();
    }
  }
}