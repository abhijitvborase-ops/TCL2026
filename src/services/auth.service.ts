import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  login(username: string, role: string) {
    localStorage.setItem("user", JSON.stringify({ username, role }));
  }

  logout() {
    localStorage.removeItem("user");
  }

  getUser() {
    return JSON.parse(localStorage.getItem("user") || 'null');
  }

  isLoggedIn(): boolean {
    return !!localStorage.getItem("user");
  }

  getRole(): string | null {
    const user = this.getUser();
    return user?.role || null;
  }
}