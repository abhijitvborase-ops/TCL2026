import { Component, ChangeDetectionStrategy, inject, OnInit, computed, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { signal } from '@angular/core';
import { FirebaseService } from './services/firebase.service';

import { AuctionService } from './services/auction.service';
import { DiceComponent } from './components/dice/dice.component';
import { Player, Team, User } from './models';

declare var lucide: any;
declare var XLSX: any;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, DiceComponent],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit, AfterViewChecked {
  auctionService = inject(AuctionService);
  firebase = inject(FirebaseService);

  selectedFile: File | null = null;
  // Form signals for login
  loginUsername = signal('');
  loginPassword = signal('');
  
  // Team colors
  teamColors = [
    { name: 'Red', value: 'border-red-500' },
    { name: 'Blue', value: 'border-blue-500' },
    { name: 'Green', value: 'border-green-500' },
    { name: 'Yellow', value: 'border-yellow-500' },
    { name: 'Purple', value: 'border-purple-500' },
    { name: 'Pink', value: 'border-pink-500' },
    { name: 'Indigo', value: 'border-indigo-500' },
    { name: 'Teal', value: 'border-teal-500' }
  ];
  
  // Form signals for creating a new team
  newTeamName = signal('');
  newOwnerName = signal('');
  newUsername = signal('');
  newPassword = signal('');
  newTeamColor = signal<string>(this.teamColors[0].value);
  
  // Signals for editing a team
  editingTeam = signal<Team | null>(null);
  editTeamName = signal('');
  editOwnerName = signal('');
  editUsername = signal('');
  editPassword = signal('');
  editTeamColor = signal('');

  // Form signals for creating a player
  newPlayerName = signal('');
  newPlayerPhotoUrl = signal<string | undefined>(undefined);
  
  // Signals for editing a player
  editingPlayer = signal<Player | null>(null);
  editPlayerName = signal('');
  editPlayerPhotoUrl = signal<string | undefined>(undefined);

  // Signal for viewing auction history
  viewingHistoryId = signal<number | null>(null);

  // Signal for draft confirmation
  draftConfirmation = signal<Player | null>(null);

  // Signal for admin lobby tabs
  adminLobbyView = signal<'create' | 'manage'>('create');

  // Computed signal to find the current user's team
  currentUserTeam = computed(() => {
    const user = this.auctionService.currentUser();
    if (user?.role !== 'team_owner' || !user.teamId) {
      return null;
    }
    return this.auctionService.teams().find(t => t.id === user.teamId) ?? null;
  });

  ngOnInit() {
  }

  ngAfterViewChecked() {
    lucide.createIcons();
  }
  
  onLogin() {
    this.auctionService.login(this.loginUsername(), this.loginPassword());
  }

  onEnterPublicView() {
    this.auctionService.enterPublicView();
  }

  onReturnToLogin() {
    this.auctionService.returnToLogin();
  }
  
  onStartAuction() {
    this.auctionService.startAuction();
  }

  onRollForNextPick() {
    this.auctionService.rollForNextPick();
  }
  
  onNextRound() {
    this.auctionService.nextRound();
  }

  onDraftPlayerClick(player: Player) {
    this.draftConfirmation.set(player);
  }

  confirmDraft() {
    const player = this.draftConfirmation();
    if (player) {
      this.auctionService.draftPlayer(player);
      this.draftConfirmation.set(null);
    }
  }

  cancelDraft() {
    this.draftConfirmation.set(null);
  }

  onUndoLastDraft() {
    this.auctionService.undoLastDraft();
  }

  onCreateTeam() {
    if (this.newTeamName() && this.newOwnerName() && this.newUsername() && this.newPassword()) {
        this.auctionService.createTeamOwner(
          this.newTeamName(), 
          this.newOwnerName(), 
          this.newUsername(), 
          this.newPassword(),
          this.newTeamColor()
        );

        this.newTeamName.set('');
        this.newOwnerName.set('');
        this.newUsername.set('');
        this.newPassword.set('');
        this.newTeamColor.set(this.teamColors[0].value);
    }
  }

  startEditing(team: Team) {
    this.editingTeam.set(team);
    this.editTeamName.set(team.name);
    this.editOwnerName.set(team.owner);
    this.editTeamColor.set(team.color);
    const user = this.auctionService.users().find(u => u.teamId === team.id);
    if (user) {
      this.editUsername.set(user.username);
    }
    this.editPassword.set(''); // Clear password field for security
  }

  cancelEditing() {
    this.editingTeam.set(null);
  }

  onUpdateTeam() {
    const team = this.editingTeam();
    if (!team) return;

    const updatedData = {
      teamName: this.editTeamName(),
      ownerName: this.editOwnerName(),
      username: this.editUsername(),
      password: this.editPassword() || undefined,
      color: this.editTeamColor()
    };
    
    this.auctionService.updateTeamOwner(team.id, updatedData);
    this.cancelEditing();
  }

  onDeleteTeam(team: Team) {
    if (confirm(`Are you sure you want to delete the team "${team.name}" and its owner? This action cannot be undone.`)) {
      this.auctionService.deleteTeamOwner(team.id);
    }
  }

  async onCreatePlayer() {
  if (!this.newPlayerName()) return;

  let photoUrl = "";

  if (this.selectedFile) {
    photoUrl = await this.firebase.uploadImage(this.selectedFile);
  }

  console.log("Uploaded URL:", photoUrl);

  this.auctionService.createPlayer({
    name: this.newPlayerName(),
    photoUrl: photoUrl
  });

  this.newPlayerName.set('');
  this.selectedFile = null;
}
  onPlayerPhotoUpload(event: any) {
  const file = event.target.files[0];
  if (file) {
    this.selectedFile = file;
  }
}

  startEditingPlayer(player: Player) {
    this.editingPlayer.set(player);
    this.editPlayerName.set(player.name);
    this.editPlayerPhotoUrl.set(player.photoUrl);
  }

  onEditPlayerPhotoUpload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.editPlayerPhotoUrl.set(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  cancelEditingPlayer() {
    this.editingPlayer.set(null);
    this.editPlayerPhotoUrl.set(undefined);
  }

  onUpdatePlayer() {
    const player = this.editingPlayer();
    if (!player) return;

    this.auctionService.updatePlayer(player.id, {
        name: this.editPlayerName(),
        photoUrl: this.editPlayerPhotoUrl()
    });

    this.cancelEditingPlayer();
  }

  onDeletePlayer(player: Player) {
    if (confirm(`Are you sure you want to permanently delete player "${player.name}"? This cannot be undone.`)) {
        this.auctionService.deletePlayer(player.id);
    }
  }

  onStopAuction() {
    if (confirm('Are you sure you want to end the auction? The current results will be displayed.')) {
      this.auctionService.stopAuction();
    }
  }
  
  onResetAuction() {
    if (confirm('Are you sure you want to start a new auction? This will clear all drafted players and return you to the lobby.')) {
      this.auctionService.resetAuction();
    }
  }

  onExportRosters() {
    const rosters: { Team: string, Player: string }[] = [];
    this.auctionService.teams().forEach(team => {
      team.players.forEach(player => {
        rosters.push({
          Team: team.name,
          Player: player.name
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(rosters);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rosters');
    XLSX.writeFile(wb, 'Tanish_Champions_League_2026_Rosters.xlsx');
  }

  onToggleHistoryView(auctionId: number) {
    if (this.viewingHistoryId() === auctionId) {
      this.viewingHistoryId.set(null); // Close if already open
    } else {
      this.viewingHistoryId.set(auctionId);
    }
  }

  onDeleteHistory(auctionId: number) {
    if (confirm('Are you sure you want to permanently delete this auction record?')) {
      this.auctionService.deletePastAuction(auctionId);
    }
  }

  getUserForTeam(teamId: number): User | undefined {
    return this.auctionService.users().find(u => u.teamId === teamId);
  }
  
  getBgColor(borderColor: string): string {
    return borderColor.replace('border-', 'bg-');
  }

  getTextColor(borderColor: string): string {
    if (!borderColor) return 'text-gray-100';
    return borderColor.replace('border-', 'text-');
  }
}