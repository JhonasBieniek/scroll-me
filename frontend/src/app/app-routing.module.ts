import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { guestGuard } from './core/auth/guest.guard';
import { LoginComponent } from './features/auth/login/login.component';
import { RegisterComponent } from './features/auth/register/register.component';
import { AppShellComponent } from './features/shell/app-shell.component';

const routes: Routes = [
  {
    path: 'login',
    title: 'Entrar · Scroll Me',
    canActivate: [guestGuard],
    component: LoginComponent,
  },
  {
    path: 'register',
    title: 'Criar conta · Scroll Me',
    canActivate: [guestGuard],
    component: RegisterComponent,
  },
  {
    pathMatch: 'full',
    path: '',
    title: 'Scroll Me',
    canActivate: [authGuard],
    component: AppShellComponent,
  },
  { path: '**', redirectTo: '' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
