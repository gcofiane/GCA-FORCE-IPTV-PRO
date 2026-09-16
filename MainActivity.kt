package com.gcaforce.iptvpro

import android.app.*
import android.os.Bundle
import android.provider.Settings
import android.graphics.Color
import android.view.Gravity
import android.widget.*
import org.json.JSONObject

class MainActivity:Activity(){
    private lateinit var status:TextView
    private lateinit var content:FrameLayout
    private val deviceId by lazy{Settings.Secure.getString(contentResolver,Settings.Secure.ANDROID_ID)}

    override fun onCreate(b:Bundle?){
        super.onCreate(b); setContentView(R.layout.activity_main)
        status=findViewById(R.id.status); content=findViewById(R.id.content)
        findViewById<Button>(R.id.homeBtn).setOnClickListener{home()}
        findViewById<Button>(R.id.liveBtn).setOnClickListener{live()}
        findViewById<Button>(R.id.activateBtn).setOnClickListener{activate()}
        findViewById<Button>(R.id.devicesBtn).setOnClickListener{devices()}
        login()
    }

    private fun login(){
        val box=LinearLayout(this);box.orientation=LinearLayout.VERTICAL;box.gravity=Gravity.CENTER
        val email=EditText(this);email.hint="E-mail";email.setText("demo@gcaforce.local")
        val pass=EditText(this);pass.hint="Mot de passe";pass.setText("Demo123!")
        val btn=Button(this);btn.text="SE CONNECTER"
        box.addView(email);box.addView(pass);box.addView(btn);content.removeAllViews();content.addView(box)
        btn.setOnClickListener{
            val body=JSONObject().put("email",email.text.toString()).put("password",pass.text.toString())
            ApiClient.post("api/login",body){ok,res->runOnUiThread{
                if(ok){ApiClient.token=JSONObject(res).getString("token");status.text="Connecté";home()}
                else status.text="Connexion impossible"
            }}
        }
    }
    private fun home(){
        val t=TextView(this);t.setTextColor(Color.WHITE);t.textSize=22f;t.text="Bienvenue sur GCA FORCE-IPTV PRO

Sélectionne une rubrique avec la télécommande."
        content.removeAllViews();content.addView(t)
    }
    private fun live(){
        val t=TextView(this);t.setTextColor(Color.WHITE);t.textSize=20f;t.text="LIVE TV

Les playlists/flux autorisés seront chargés depuis le backend."
        content.removeAllViews();content.addView(t)
    }
    private fun activate(){
        val box=LinearLayout(this);box.orientation=LinearLayout.VERTICAL
        val code=EditText(this);code.hint="Code d’activation";val btn=Button(this);btn.text="ACTIVER"
        box.addView(code);box.addView(btn);content.removeAllViews();content.addView(box)
        btn.setOnClickListener{
            val body=JSONObject().put("code",code.text.toString()).put("deviceId",deviceId).put("deviceName","Android TV").put("platform","Android")
            ApiClient.post("api/activate",body){ok,res->runOnUiThread{status.text=if(ok)"Activation réussie" else "Code invalide ou déjà utilisé"}}
        }
    }
    private fun devices(){
        ApiClient.get("api/devices"){ok,res->runOnUiThread{
            val t=TextView(this);t.setTextColor(Color.WHITE);t.textSize=18f;t.text=if(ok)"APPAREILS

$res" else "Impossible de charger les appareils"
            content.removeAllViews();content.addView(t)
        }}
    }
}