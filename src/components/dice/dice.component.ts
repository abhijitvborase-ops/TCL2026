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
  getFaceTeamName(index: number): string {

  if (this.isRolling()) {
    return 'Rolling... 🎲';
  }

  const result = this.diceResult();

  if (!result) {
    return 'TCL 2026';
  }

  const teams = this.teams();

  return teams?.[index]?.name ?? 'TCL 2026';
}
  cubeClass = computed(() => {
  if (this.isRolling()) {
    return 'rolling';
  }

  // 🔥 ALWAYS SHOW FRONT (NO MISMATCH)
  return 'show-front';
});
}