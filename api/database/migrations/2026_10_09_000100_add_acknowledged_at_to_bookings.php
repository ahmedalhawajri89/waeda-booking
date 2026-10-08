<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * "Did the business actually get my booking?"
 *
 * The commonest complaint about booking apps in the region is a confirmation
 * the venue never saw. A booking made from the public page now starts
 * unacknowledged, and stays so until someone at the business opens or acts on
 * it; the guest's manage page says which. Everything already booked was seen
 * by whoever is running the place, so existing rows count as acknowledged.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->timestamp('acknowledged_at')->nullable()->after('channel');
        });
        DB::table('bookings')->update(['acknowledged_at' => DB::raw('created_at')]);
    }

    public function down(): void
    {
        Schema::table('bookings', fn (Blueprint $t) => $t->dropColumn('acknowledged_at'));
    }
};
