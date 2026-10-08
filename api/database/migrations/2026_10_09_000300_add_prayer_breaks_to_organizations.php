<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Whether a business pauses for prayer, and how: the city its times come
 * from, which prayers, for how many minutes, and a longer pause for Jumu'ah.
 * Null is off — not every business stops.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            $table->json('prayer_breaks')->nullable()->after('address');
        });
    }

    public function down(): void
    {
        Schema::table('organizations', fn (Blueprint $t) => $t->dropColumn('prayer_breaks'));
    }
};
