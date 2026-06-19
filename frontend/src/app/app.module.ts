import { CommonModule } from '@angular/common';

import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { NgModule, provideZoneChangeDetection } from '@angular/core';

import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';

import { AppComponent } from './app.component';

import { authInterceptor } from './core/auth/auth.interceptor';

import { AuthLayoutComponent } from './features/auth/auth-layout/auth-layout.component';

import { LoginComponent } from './features/auth/login/login.component';

import { RegisterComponent } from './features/auth/register/register.component';

import { CreatePostComponent } from './features/create/create-post.component';

import { FeedComponent } from './features/feed/feed.component';

import { VideoCardComponent } from './features/feed/video-card/video-card.component';

import { ProfileComponent } from './features/profile/profile.component';

import { AppShellComponent } from './features/shell/app-shell.component';

import { AvatarComponent } from './shared/ui/avatar/avatar.component';

import { VideoPlayerComponent } from './shared/ui/video-player/video-player.component';



@NgModule({

  declarations: [

    AppComponent,

    AuthLayoutComponent,

    LoginComponent,

    RegisterComponent,

    AppShellComponent,

    FeedComponent,

    VideoCardComponent,

    CreatePostComponent,

    ProfileComponent,

    AvatarComponent,

    VideoPlayerComponent,

  ],

  imports: [

    BrowserModule,

    AppRoutingModule,

    CommonModule,

    FormsModule,

    ReactiveFormsModule,

  ],

  bootstrap: [AppComponent],

  providers: [

    provideZoneChangeDetection({ eventCoalescing: true }),

    provideHttpClient(withInterceptors([authInterceptor])),

  ],

})

export class AppModule {}

