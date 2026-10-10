<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * The secret in a guest's "manage your booking" link.
 *
 * The reference is sequential and the phone is not a secret, so neither, nor
 * both, may open someone's booking. The link carries a random token instead;
 * only its hash is stored. A booking made before this has none, and is opened
 * by a phone proven with a code.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->char('manage_token_hash', 64)->nullable()->after('reference');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn('manage_token_hash');
        });
    }
};
