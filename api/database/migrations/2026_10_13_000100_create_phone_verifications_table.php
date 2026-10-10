<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Proving a phone number before it is used as an identity.
 *
 * A guest's phone is who they are — it finds their customer record, it is
 * where reminders go — so the server, not the page, has to know they hold it.
 * A row is one code sent; once the code is entered it carries a token the
 * device keeps, so the next booking from it needs no code. Only hashes are
 * stored: the code and the token are secrets.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('phone_verifications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('org_id');
            $table->string('phone_digits', 32);
            $table->string('code_hash');
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->timestamp('expires_at');
            $table->char('token_hash', 64)->nullable()->unique();
            $table->timestamp('verified_at')->nullable();
            $table->timestamps();

            $table->index(['org_id', 'phone_digits', 'created_at']);
            $table->foreign('org_id')->references('id')->on('organizations')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('phone_verifications');
    }
};
