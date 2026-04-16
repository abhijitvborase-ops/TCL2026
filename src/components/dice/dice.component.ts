import { Component, ChangeDetectionStrategy, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuctionService } from '../../services/auction.service';

@Component({
  selector: 'app-dice',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dice.component.html',
  styleUrls: ['./dice.component.css'],
  changeDetection: ChangeDetectionStrategy.Default,
})
export class DiceComponent {
  auctionService = inject(AuctionService);
  
  isRolling = this.auctionService.isRolling;

  // 🔥 IMPORTANT (rename for HTML use)
  diceResult = this.auctionService.diceResult;

  teams = this.auctionService.teams;
  
  cubeClass = computed(() => {
    if (this.isRolling()) {
      return 'rolling';
    }

    const team = this.diceResult();
    if (team) {
      const currentTeams = this.teams();
      const teamIndex = currentTeams.findIndex(t => t.id === team.id);

      switch (teamIndex) {
        case 0: return 'show-front';
        case 1: return 'show-right';
        case 2: return 'show-back';
        case 3: return 'show-left';
        default: return '';
      }
    }

    return '';
  });
}