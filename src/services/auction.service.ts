import { Injectable, signal, computed, WritableSignal, effect } from '@angular/core';
import { Player, Team, User, CompletedAuction } from '../models';
import { FirebaseService } from './firebase.service';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { collection } from 'firebase/firestore';
import { setDoc } from 'firebase/firestore';
import { getDocs } from 'firebase/firestore';
import { ChangeDetectorRef } from '@angular/core';

export type AuctionState = 'login' | 'public_view' | 'admin_lobby' | 'admin_view' | 'team_view' | 'auction_ended';
export type DraftAnnouncement = { player: Player; team: Team };

const DEFAULT_PLAYERS: Player[] = [];

const TEAMS_STORAGE_KEY = 'tcl2026_teams';
const USERS_STORAGE_KEY = 'tcl2026_users';
const PLAYERS_STORAGE_KEY = 'tcl2026_players';
const HISTORY_STORAGE_KEY = 'tcl2026_history';
const AUCTION_STATUS_KEY = 'tcl2026_auction_status';

@Injectable({
  providedIn: 'root',
})
export class AuctionService {
  readonly MAX_ROUNDS = 15;
  readonly TEAMS_PER_ROUND = 5;
  
  // State Signals
  auctionState: WritableSignal<AuctionState> = signal('login');
  currentUser = signal<User | null>(null);
  teams = signal<Team[]>([]);
  masterPlayerList = signal<Player[]>([]);
  availablePlayers = signal<Player[]>([]);
  users = signal<User[]>([]);
  auctionHistory = signal<CompletedAuction[]>([]);
  isAuctionActive = signal<boolean>(false);

  // Auction flow signals
  currentRound = signal(1);
  diceResult = signal<Team | null>(null);
  roundOrder = signal<Team[]>([]);
  turnIndex = signal(0);
  isRolling = signal(false);
  errorMessage = signal<string | null>(null);
  lastDraftedPlayerInfo = signal<DraftAnnouncement | null>(null);
  
  // Store latest auction data from Firebase
  private latestAuctionData: any = null;
  private lastProcessedState: any = null;

  // Undo functionality
  lastDraftAction = signal<{ player: Player; teamId: number } | null>(null);

  // Computed Signals
  isRoundCompleted = computed(() => {
    const order = this.roundOrder();
    const turn = this.turnIndex();
    // Round is completed when all teams in the order have picked.
    return order.length > 0 && turn >= order.length;
  });

  pickingTeam = computed(() => {
    const order = this.roundOrder();
    const turn = this.turnIndex();
    if (order.length === 0 || this.isRoundCompleted()) {
      return null;
    }
    return order[turn];
  });
  
  isMyTurn = computed(() => {
    const user = this.currentUser();
    const picking = this.pickingTeam();
    if (!user || !picking || user.role !== 'team_owner') {
      return false;
    }
    return user.teamId === picking.id;
  });

  canUndo = computed(() => this.lastDraftAction() !== null);

  constructor(private firebase: FirebaseService) {
    console.log("AuctionService constructor called");
    this.loadStateFromStorage();
    this.listenToTeams();   // 👈 FIRST
    this.listenToPlayers();
    this.listenToFirebaseAuction(); // 👈 LAST
    this.isAuctionActive.set(localStorage.getItem(AUCTION_STATUS_KEY) === 'active');
    window.addEventListener('storage', this.handleStorageChange.bind(this));

    // Effects to automatically save state to localStorage on any change.
    effect(() => {
      localStorage.setItem(TEAMS_STORAGE_KEY, JSON.stringify(this.teams()));
    });
    effect(() => {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(this.users()));
    });
    effect(() => {
      localStorage.setItem(PLAYERS_STORAGE_KEY, JSON.stringify(this.masterPlayerList()));
    });
    effect(() => {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(this.auctionHistory()));
    });
  }

  private updateTeamsWithPlayers(players: Player[]) {
    this.teams.update(teams => {
      return teams.map(team => ({
        ...team,
        players: players.filter(p => p.sold && p.soldTo === team.id)
      }));
    });
  }

  private updateAuctionDataWithTeams() {
    if (!this.latestAuctionData || this.teams().length === 0) return;
   
    const data = this.latestAuctionData;
    this.currentRound.set(data.currentRound || 1);
    this.turnIndex.set(data.turnIndex || 0);
    this.isAuctionActive.set(data.isActive || false);
    // 🔥 only update if changed (IMPORTANT)
if (this.isRolling() !== (data.isRolling || false)) {
  this.isRolling.set(data.isRolling || false);
}
      // 🔥 round order
    const newOrder = (data.roundOrder || [])
  .map((id: number) => this.teams().find(t => t.id === id))
  .filter(Boolean) as Team[];

// 🔥 only update if changed
if (JSON.stringify(this.roundOrder()) !== JSON.stringify(newOrder)) {
  this.roundOrder.set(newOrder);
}
// 🔥 sync dice with latest Firebase order (NO DELAY)
if (newOrder.length > 0) {
  const lastTeam = newOrder[newOrder.length - 1];

  if (this.diceResult()?.id !== lastTeam.id) {
    this.diceResult.set(lastTeam);
  }
}
  }

  private handleStorageChange(event: StorageEvent) {
    if (event.key === AUCTION_STATUS_KEY) {
      this.isAuctionActive.set(event.newValue === 'active');
    }
  }

  private loadStateFromStorage() {
    try {
      const storedTeams = localStorage.getItem(TEAMS_STORAGE_KEY);
      const storedUsers = localStorage.getItem(USERS_STORAGE_KEY);
      const storedPlayers = localStorage.getItem(PLAYERS_STORAGE_KEY);
      const storedHistory = localStorage.getItem(HISTORY_STORAGE_KEY);

      if (storedHistory) {
        this.auctionHistory.set(JSON.parse(storedHistory));
      }

      if (storedTeams && storedUsers && storedPlayers) {
        const loadedTeams: Team[] = JSON.parse(storedTeams);
        // Ensure rosters are clear on load; persistence is for setup, not mid-auction state.
        loadedTeams.forEach(t => t.players = []); 
        
        this.teams.set(loadedTeams);
        this.users.set(JSON.parse(storedUsers));
        this.masterPlayerList.set(JSON.parse(storedPlayers));
        
        // On load, all players from the master list are available.
        this.availablePlayers.set([...this.masterPlayerList()]);
      } else {
        this.seedData();
      }
    } catch (e) {
      console.error('Error loading state from localStorage', e);
      this.seedData();
    }
  }

  private seedData() {
    this.masterPlayerList.set([...DEFAULT_PLAYERS]);
    this.availablePlayers.set([...this.masterPlayerList()]);

    const initialTeams: Team[] = [];
    this.teams.set(initialTeams);

    const initialUsers: User[] = [
      { id: 1, username: 'admin', password: 'password', role: 'admin' },
    ];
    this.users.set(initialUsers);
    this.auctionHistory.set([]);
  }

  login(username: string) {
  // 🔥 admin check
  if (username === 'admin') {
    this.currentUser.set({
      id: 1,
      username: 'admin',
      role: 'admin'
    } as any);

    this.auctionState.set('admin_lobby');
    this.errorMessage.set(null);
    return;
  }

  // 🔥 team match करून user बनव
  const team = this.teams().find(t => 
    t.owner.toLowerCase().includes(username.toLowerCase())
  );

  if (team) {
    this.currentUser.set({
      id: team.id,
      username: username,
      role: 'team_owner',
      teamId: team.id
    });

    this.auctionState.set('team_view');
    this.errorMessage.set(null);
  } else {
    this.errorMessage.set('User not found');
  }
}
  logout() {
    this.currentUser.set(null);
    this.auctionState.set('login');
  }

  enterPublicView() {
    this.auctionState.set('public_view');
  }

  returnToLogin() {
    this.auctionState.set('login');
  }
  async startAuction() {
  if (this.currentUser()?.role !== 'admin') return;

  // 🔥 RESET TEAMS
  const teamsRef = collection(this.firebase.db, "teams");
  const snapshot = await getDocs(teamsRef);

  for (const docSnap of snapshot.docs) {
    await updateDoc(doc(this.firebase.db, "teams", docSnap.id), {
      players: []
    });
  }

  // 🔥 RESET PLAYERS
  const playersRef = collection(this.firebase.db, "players");
  const playerSnapshot = await getDocs(playersRef);

  for (const docSnap of playerSnapshot.docs) {
    await updateDoc(doc(this.firebase.db, "players", docSnap.id), {
      sold: false,
      soldTo: null
    });
  }

  // 🔥 START AUCTION
  const auctionRef = doc(this.firebase.db, "auction", "live");

  await setDoc(auctionRef, {
    isActive: true,
    currentRound: 1,
    turnIndex: 0,
    diceTeamId: null,
    roundOrder: [],
    isRolling: false
  });

  this.auctionState.set('admin_view');
}
  async rollForNextPick() {
    // 🔥 NEW GUARD (ADD THIS AT TOP)
const allTeams = this.teams();

if (!allTeams || allTeams.length === 0) {
  console.log("Teams not loaded yet ❌");
  return;
}
  const teamsInRound = this.roundOrder();
  if (
    this.isRolling() ||
    teamsInRound.length >= allTeams.length
  ) {
    return;
  }

  const auctionRef = doc(this.firebase.db, "auction", "live");

  // 🔥 START rolling (ALL USERS)
  await updateDoc(auctionRef, {
  isRolling: true,
  diceTeamId: null   // 🔥 IMPORTANT FIX
});
// 🔥 WAIT for animation (2 seconds)
await new Promise(resolve => setTimeout(resolve, 2000));
  const availableToPick = allTeams.filter(
    t => !teamsInRound.find(inRound => inRound.id === t.id)
  );

  if (availableToPick.length === 0) {
    await updateDoc(auctionRef, { isRolling: false });
    return;
  }

  const pickedTeam =
    availableToPick[Math.floor(Math.random() * availableToPick.length)];
    
  const currentIds = teamsInRound.map(t => t.id);

  // 🔥 RESULT + STOP rolling
  await updateDoc(auctionRef, {
    diceTeamId: pickedTeam.id,
    roundOrder: [...new Set([...currentIds, pickedTeam.id])],
    isRolling: false
  });
  }
  async draftPlayer(player: Player) {
    const pickingTeam = this.pickingTeam();
    if (!pickingTeam || !this.isMyTurn()) return;

    // Remove from available players
    this.availablePlayers.update(players => players.filter(p => p.id !== player.id));

    // Add to team
    this.teams.update(teams => {
      const teamIndex = teams.findIndex(t => t.id === pickingTeam.id);
      if (teamIndex > -1) {
        teams[teamIndex].players.push(player);
      }
      return [...teams];
    });
    
    // Update team document in Firebase with new players list
    const teamRef = doc(this.firebase.db, "teams", String(pickingTeam.id));
    const updatedTeam = this.teams().find(t => t.id === pickingTeam.id);
    if (updatedTeam) {
      await updateDoc(teamRef, {
        players: updatedTeam.players
      });
    }
    
    // Set the last draft action for potential undo
    this.lastDraftAction.set({ player, teamId: pickingTeam.id });

    // Announce the draft for the popup
    this.lastDraftedPlayerInfo.set({ player, team: pickingTeam });
    setTimeout(() => {
        this.lastDraftedPlayerInfo.set(null);
    }, 5000); // Popup is visible for 5 seconds

    // Move to next turn in the round
    this.turnIndex.update(index => index + 1);
const playerRef = doc(this.firebase.db, "players", String(player.id));
const auctionRef = doc(this.firebase.db, "auction", "live");

await Promise.all([
  updateDoc(playerRef, {
    sold: true,
    soldTo: pickingTeam.id
  }),
  updateDoc(auctionRef, {
    turnIndex: this.turnIndex()
  })
]);
  }

  async nextRound() {
    if (!this.isRoundCompleted()) return;

    const nextRoundNumber = this.currentRound() + 1;
    
    if (nextRoundNumber > this.MAX_ROUNDS || this.availablePlayers().length === 0) {
      this.archiveAuction();
      this.auctionState.set('auction_ended');
      localStorage.setItem(AUCTION_STATUS_KEY, 'inactive');
      this.isAuctionActive.set(false);
      return;
    }

    this.currentRound.set(nextRoundNumber);
    const auctionRef = doc(this.firebase.db, "auction", "live");

await updateDoc(auctionRef, {
  currentRound: nextRoundNumber,
  turnIndex: 0,
  roundOrder: [],      
  diceTeamId: null     
});
    this.roundOrder.set([]);
    this.turnIndex.set(0);
    this.diceResult.set(null); // Reset dice for next round
    this.lastDraftAction.set(null); // Clear undo state for new round
  }

  async undoLastDraft() {
    if (this.currentUser()?.role !== 'admin') return;

    const lastAction = this.lastDraftAction();
    if (!lastAction) return;

    const { player, teamId } = lastAction;
const playerRef = doc(this.firebase.db, "players", String(player.id));

await updateDoc(playerRef, {
  sold: false,
  soldTo: null
});
const auctionRef = doc(this.firebase.db, "auction", "live");

await updateDoc(auctionRef, {
  turnIndex: this.turnIndex()
});
    // Remove player from the team
    this.teams.update(teams => {
      const teamIndex = teams.findIndex(t => t.id === teamId);
      if (teamIndex > -1) {
        teams[teamIndex].players = teams[teamIndex].players.filter(p => p.id !== player.id);
      }
      return [...teams];
    });

    // Update team document in Firebase with updated players list
    const teamRef = doc(this.firebase.db, "teams", String(teamId));
    const updatedTeam = this.teams().find(t => t.id === teamId);
    if (updatedTeam) {
      await updateDoc(teamRef, {
        players: updatedTeam.players
      });
    }

    // Add player back to available players and sort by ID to maintain order
    this.availablePlayers.update(players => 
      [...players, player].sort((a, b) => a.id - b.id)
    );

    // Decrement the turn index to revert the turn
    this.turnIndex.update(index => index - 1);
    
    // Clear the last action so it can't be undone again
    this.lastDraftAction.set(null);
  }

  async createTeamOwner(teamName: string, ownerName: string, username: string, password: string, color: string) {
    if (this.currentUser()?.role !== 'admin') return;

    const newTeamId = Math.max(...this.teams().map(t => t.id), 0) + 1;
    const newTeam: Team = {
      id: newTeamId,
      name: teamName,
      owner: ownerName,
      players: [],
      color: color
    };
    this.teams.update(teams => [...teams, newTeam]);
    const teamRef = doc(this.firebase.db, "teams", String(newTeamId));
await setDoc(teamRef, newTeam);
    const newUserId = Math.max(...this.users().map(u => u.id), 0) + 1;
    const newUser: User = {
        id: newUserId,
        username: username,
        password: password,
        role: 'team_owner',
        teamId: newTeamId
    };
    this.users.update(users => [...users, newUser]);
  }

  updateTeamOwner(
    teamId: number,
    updatedData: {
      teamName: string;
      ownerName: string;
      username: string;
      password?: string;
      color: string;
    }
  ) {
    if (this.currentUser()?.role !== 'admin') return;

    // Update team details
    this.teams.update((teams) => {
      const teamIndex = teams.findIndex((t) => t.id === teamId);
      if (teamIndex > -1) {
        teams[teamIndex] = {
          ...teams[teamIndex],
          name: updatedData.teamName,
          owner: updatedData.ownerName,
          color: updatedData.color
        };
      }
      return [...teams];
    });

    // Update user details
    this.users.update((users) => {
      const userIndex = users.findIndex((u) => u.teamId === teamId);
      if (userIndex > -1) {
        users[userIndex] = {
          ...users[userIndex],
          username: updatedData.username,
        };
        // Only update password if a new one is provided
        if (updatedData.password) {
          users[userIndex].password = updatedData.password;
        }
      }
      return [...users];
    });
  }

  deleteTeamOwner(teamId: number) {
    if (this.currentUser()?.role !== 'admin') return;

    const teamToDelete = this.teams().find(t => t.id === teamId);
    if (teamToDelete) {
        // Return the team's players to the available pool. They are still in the master list.
        const playersToReturn = teamToDelete.players;
        const sortFn = (a: Player, b: Player) => a.name.localeCompare(b.name);
        this.availablePlayers.update(current => [...current, ...playersToReturn].sort(sortFn));
    }

    // Remove team
    this.teams.update((teams) => teams.filter((t) => t.id !== teamId));

    // Remove user associated with the team
    this.users.update((users) => users.filter((u) => u.teamId !== teamId));
  }

  async createPlayer(playerData: Omit<Player, 'id'>) {
  if (this.currentUser()?.role !== 'admin') return;

  const newPlayerId = Date.now();

  const newPlayer: any = {
  id: newPlayerId,
  name: playerData.name || "",

  // 👇 fix
  photoUrl: playerData.photoUrl || "",

  sold: false,
  soldTo: null
};

  // 🔥 Firebase मध्ये save
  const playerRef = doc(this.firebase.db, "players", String(newPlayerId));

  await setDoc(playerRef, newPlayer);
}

  updatePlayer(playerId: number, updatedData: Omit<Player, 'id'>) {
    if (this.currentUser()?.role !== 'admin') return;

    const sortFn = (a: Player, b: Player) => a.name.localeCompare(b.name);
    
    const updateInList = (players: Player[]) => {
      const playerIndex = players.findIndex(p => p.id === playerId);
      if (playerIndex > -1) {
        players[playerIndex] = { ...players[playerIndex], ...updatedData };
      }
      return [...players].sort(sortFn);
    };
    
    this.masterPlayerList.update(updateInList);
    this.availablePlayers.update(updateInList);
  }

  deletePlayer(playerId: number) {
    if (this.currentUser()?.role !== 'admin') return;

    // This is the fix: ensure both lists are updated to keep the state consistent.
    // By removing from both, we ensure a deleted player is truly gone from the UI
    // and from the pool of players available for the auction.
    this.masterPlayerList.update(players => players.filter(p => p.id !== playerId));
    this.availablePlayers.update(players => players.filter(p => p.id !== playerId));
  }


  resetAuction() {
    if (this.currentUser()?.role !== 'admin') return;
  
    // Reset each team's roster to be empty
    this.teams.update(currentTeams => 
        currentTeams.map(team => ({...team, players: []}))
    );

    // Available players are everyone from the master list
    this.availablePlayers.set([...this.masterPlayerList()]);
  
    // Reset auction flow state
    this.currentRound.set(1);
    this.diceResult.set(null);
    this.roundOrder.set([]);
    this.turnIndex.set(0);
    this.isRolling.set(false);
    this.errorMessage.set(null);
    this.lastDraftAction.set(null);
    
    localStorage.setItem(AUCTION_STATUS_KEY, 'inactive');
    this.isAuctionActive.set(false);

    // Return admin to the lobby to start a new auction
    this.auctionState.set('admin_lobby');
  }

  private archiveAuction() {
    const finalTeams = this.teams().map(team => ({...team})); // Deep copy
    const newRecord: CompletedAuction = {
      id: Date.now(),
      date: new Date().toLocaleString(),
      teams: finalTeams
    };
    this.auctionHistory.update(history => [newRecord, ...history]);
  }

  stopAuction() {
    if (this.currentUser()?.role !== 'admin') return;
    this.archiveAuction();
    localStorage.setItem(AUCTION_STATUS_KEY, 'inactive');
    this.isAuctionActive.set(false);
    this.auctionState.set('auction_ended');
  }

  deletePastAuction(auctionId: number) {
    if (this.currentUser()?.role !== 'admin') return;
    this.auctionHistory.update(history => history.filter(a => a.id !== auctionId));
  }
listenToFirebaseAuction() {
  const auctionRef = doc(this.firebase.db, "auction", "live");

  onSnapshot(auctionRef, (docSnap) => {

  if (!docSnap.exists()) {
    this.latestAuctionData = null;
    this.currentRound.set(1);
    this.turnIndex.set(0);
    this.isAuctionActive.set(false);
    this.diceResult.set(null);
    this.roundOrder.set([]);
    return;
  }

  const newData = docSnap.data();

  // 🔥 duplicate snapshot ignore
  if (JSON.stringify(this.lastProcessedState) === JSON.stringify(newData)) {
    return;
  }

  // 🔥 save last state
  this.lastProcessedState = newData;

  // 🔥 update state
  this.latestAuctionData = newData;
  this.updateAuctionDataWithTeams();

}, (error) => {
  console.error("Error listening to auction:", error);
});
}
listenToPlayers() {
  const playersRef = collection(this.firebase.db, "players");

  onSnapshot(playersRef, (snapshot) => {
    console.log("Firebase players snapshot received:", snapshot.docs.length, "players");
    const players = snapshot.docs.map(doc => ({
      id: Number(doc.id),
      ...doc.data()
    })) as any;

    this.masterPlayerList.set(players);
    this.availablePlayers.set(
  players.filter((p: any) => !p.sold)
);
    
    // Update teams with sold players
    this.updateTeamsWithPlayers(players);
  }, (error) => {
    console.error("Error listening to players:", error);
  });
}

listenToTeams() {
  const teamsRef = collection(this.firebase.db, "teams");

  onSnapshot(teamsRef, (snapshot) => {
    console.log("Firebase teams snapshot received:", snapshot.docs.length, "teams");
    const teams = snapshot.docs.map((doc: any) => ({
      id: Number(doc.id),
      ...doc.data()
    })) as any;

    // 🔥 only update if changed
if (JSON.stringify(this.teams()) !== JSON.stringify(teams)) {
  this.teams.set(teams);
}
    
    // After teams are loaded, try to update auction data that depends on teams
    // this!.updateAuctionDataWithTeams();
    
    // Also update teams with players if players are already loaded
    this.updateTeamsWithPlayers(this.masterPlayerList());
  }, (error) => {
    console.error("Error listening to teams:", error);
  });
}
}