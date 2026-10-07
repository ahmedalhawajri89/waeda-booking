<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * `role` and `org_id` are deliberately absent.
     *
     * This list is what a request body is allowed to reach. Postgres kept the
     * role in a JWT claim the database itself issued, so a client could not
     * write it; here the equivalent guarantee is this array. Adding 'role' to
     * it would make operator access a field on the sign-up form.
     */
    protected $fillable = ['name', 'email', 'password', 'phone'];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function isOperator(): bool
    {
        return $this->role === 'operator';
    }

    /** The shape src/stores/auth.js expects from /auth/me and /auth/login. */
    public function toSession(): array
    {
        return [
            'id' => (string) $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role,
            // The business's public booking link is /b/{orgSlug}.
            'orgSlug' => $this->org_id
                ? Organization::query()->whereKey($this->org_id)->value('slug')
                : null,
        ];
    }
}
